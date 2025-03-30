const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const config = require('./config');
const logger = require('./config/logger'); // Import the structured logger
const db = require('./config/database');
const AuthService = require('./services/authService');
const WebSocketHandlers = require('./websocket/handlers');
const WebSocketBroadcaster = require('./websocket/broadcaster');
const MessageModel = require('./models/messageModel');
const ChannelModel = require('./models/channelModel');
const AuditModel = require('./models/auditModel');

class WebSocketRateLimiter {
  constructor() {
    this.clients = new Map();
    this.windowMs = 60000; // 1 minute window
    this.maxMessages = 100; // 100 messages per minute
  }
  
  isRateLimited(clientId) {
    const now = Date.now();
    if (!this.clients.has(clientId)) {
      this.clients.set(clientId, { count: 1, resetAt: now + this.windowMs });
      return false;
    }
    const client = this.clients.get(clientId);
    if (now > client.resetAt) {
      client.count = 1;
      client.resetAt = now + this.windowMs;
      return false;
    }
    if (client.count >= this.maxMessages) {
      return true;
    }
    client.count++;
    return false;
  }
}

class ChatServer {
  constructor(config = {}) {
    this.config = {
      port: config.port || 3000,
      host: config.host || 'localhost',
      maxConnections: config.maxConnections || 100,
      connectionTimeout: config.connectionTimeout || 30000,
      pingInterval: config.pingInterval || 30000,
      authenticateUsers: true  // Always require authentication
    };

    this.httpServer = http.createServer(this.handleHttpRequest.bind(this));
    this.wss = new WebSocket.Server({ 
      server: this.httpServer,
      maxPayload: 1024 * 1024, // 1MB max payload
      clientTracking: true
    });
    this.broadcaster = new WebSocketBroadcaster(this.wss);
    this.connections = new Map();
    this.rateLimiter = new WebSocketRateLimiter();
  }

  async start(startHttpServer = true) {
    try {
      this.wss.on('connection', this.handleWebSocketConnection.bind(this));
      this.wss.on('error', this.handleServerError.bind(this));
      if (startHttpServer) {
        await this.startHttpServer();
      }
      await AuditModel.log({
        action: 'server_start',
        details: { host: this.config.host, port: this.config.port }
      });
      logger.info(`MCP Messenger Chat Server running on ${this.config.host}:${this.config.port}`); // Use logger.info
    } catch (error) {
      logger.error({ err: error }, 'Server startup failed'); // Use logger.error with error object
      await AuditModel.log({
        action: 'server_start_failed',
        details: { error: error.message, stack: error.stack } // Include stack in audit details
      });
      throw error;
    }
  }

  startHttpServer() {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.config.port, this.config.host, () => resolve());
      this.httpServer.on('error', (error) => {
        logger.error({ err: error }, 'HTTP Server error'); // Use logger.error
        reject(error);
      });
    });
  }

  handleHttpRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }));
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
  }

  async handleWebSocketConnection(ws, req) {
    try {
      if (this.wss.clients.size > this.config.maxConnections) {
        ws.close(1013, 'Server is at maximum capacity');
        return;
      }
      const AUTH_TIMEOUT = 5000; // 5 seconds
      let authTimeoutId = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          logger.warn('Authentication timeout - closing connection'); // Use logger.warn
          ws.close(1008, 'Authentication timeout');
        }
      }, AUTH_TIMEOUT);

      const user = await WebSocketHandlers.authenticate(ws, req);
      if (!user) {
        ws.close(1008, 'Authentication failed');
        return;
      }
      if (authTimeoutId) {
        clearTimeout(authTimeoutId);
      }

      // Initialize connection monitoring: record last pong timestamp
      ws.lastPong = Date.now();

      this.broadcaster.registerConnection(ws, user);

      ws.on('message', async (message) => {
        if (this.rateLimiter.isRateLimited(user.id)) {
          WebSocketHandlers.sendResponse(ws, {
            type: 'error',
            error: 'Rate limit exceeded. Please slow down.',
            timestamp: new Date().toISOString()
          });
          return;
        }
        try {
          await WebSocketHandlers.handleMessage(ws, user, message, this.broadcaster);
        } catch (error) {
          logger.error({ err: error, userId: user?.id }, 'Message handling error'); // Use logger.error with context
        }
      });

      ws.on('close', async () => {
        this.broadcaster.removeConnection(ws);
        if (user.id) {
          await AuditModel.log({
            userId: user.id,
            action: 'websocket_disconnect',
            details: { reason: 'connection_closed' }
          });
        } else {
          // This case might indicate an issue if a user object exists but has no ID
          logger.debug('Skipping audit log for user disconnection (user ID missing).'); // Use logger.debug
        }
      });

      // Ping mechanism with connection monitoring
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          // Check if connection is stale (no pong received within 2x ping interval)
          if (Date.now() - ws.lastPong > this.config.pingInterval * 2) {
            logger.warn({ userId: user?.id }, 'Stale connection detected (no pong received). Terminating connection.'); // Use logger.warn
            ws.terminate();
            clearInterval(pingInterval);
            return;
          }
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, this.config.pingInterval);

      ws.on('pong', () => {
        ws.lastPong = Date.now();
      });
    } catch (error) {
      logger.error({ err: error }, 'WebSocket connection error'); // Use logger.error
      // Attempt to close gracefully before auditing
      try { ws.close(1011, 'Unexpected server error'); } catch (closeErr) { /* Ignore close errors */ }
      await AuditModel.log({
        action: 'websocket_connection_failed',
        details: { error: error.message }
      });
    }
  }

  isLocalNetworkRequest(req) {
    const ip = req.socket.remoteAddress;
    return ip === '127.0.0.1' ||
           ip === '::1' ||
           ip.startsWith('192.168.') ||
           ip.startsWith('10.') ||
           ip.startsWith('172.16.');
  }

  async handleServerError(error) {
    logger.error({ err: error }, 'WebSocket server error'); // Use logger.error
    await AuditModel.log({
      action: 'websocket_server_error',
      details: { error: error.message, stack: error.stack } // Include stack
    });
    try {
      await this.broadcaster.broadcastSystemMessage({
        type: 'system_error',
        message: 'Server experiencing technical difficulties'
      });
    } catch (broadcastError) {
      logger.error({ err: broadcastError }, 'Error broadcasting system error message'); // Use logger.error
    }
  }

  async shutdown() {
    try {
      await AuditModel.log({ action: 'server_shutdown', details: {} });
      this.wss.clients.forEach(ws => {
        ws.close(1001, 'Server shutdown');
      });
      await new Promise((resolve, reject) => {
        this.httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      await db.pool.end(); // Ensure pool is closed before logging completion
      logger.info('MCP Messenger Chat Server shutdown complete'); // Use logger.info
    } catch (error) {
      logger.error({ err: error }, 'Server shutdown error'); // Use logger.error
    }
  }
}

module.exports = ChatServer;

if (require.main === module) {
  const server = new ChatServer(config);
  server.start();
  process.on('SIGTERM', () => server.shutdown());
  process.on('SIGINT', () => server.shutdown());
}
