const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const config = require('./config');
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
      console.log(`MCP Messenger Chat Server running on ${this.config.host}:${this.config.port}`);
    } catch (error) {
      console.error('Server startup failed:', error);
      await AuditModel.log({
        action: 'server_start_failed',
        details: { error: error.message }
      });
      throw error;
    }
  }

  startHttpServer() {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.config.port, this.config.host, () => resolve());
      this.httpServer.on('error', (error) => {
        console.error('HTTP Server error:', error);
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
          console.log('Authentication timeout - closing connection');
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
          console.error('Message handling error:', error);
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
          console.log('Skipping audit log for local testing user disconnection.');
        }
      });

      // Ping mechanism with connection monitoring
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          // Check if connection is stale (no pong received within 2x ping interval)
          if (Date.now() - ws.lastPong > this.config.pingInterval * 2) {
            console.warn('Stale connection detected. Closing connection.');
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
      console.error('WebSocket connection error:', error);
      ws.close(1011, 'Unexpected server error');
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
    console.error('WebSocket server error:', error);
    await AuditModel.log({
      action: 'websocket_server_error',
      details: { error: error.message }
    });
    try {
      await this.broadcaster.broadcastSystemMessage({
        type: 'system_error',
        message: 'Server experiencing technical difficulties'
      });
    } catch (broadcastError) {
      console.error('Error broadcasting system message:', broadcastError);
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
      await db.pool.end();
      console.log('MCP Messenger Chat Server shutdown complete');
    } catch (error) {
      console.error('Server shutdown error:', error);
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
