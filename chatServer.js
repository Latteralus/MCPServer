const http = require('http');
const WebSocket = require('ws');
const url = require('url');

const AuthService = require('./services/authService');
const WebSocketHandlers = require('./websocket/handlers');
const WebSocketBroadcaster = require('./websocket/broadcaster');
const MessageModel = require('./models/messageModel');
const ChannelModel = require('./models/channelModel');
const AuditModel = require('./models/auditModel');
const config = require('./config');
const port = config.port;



class ChatServer {
  constructor(config = {}) {
    // Default configuration
    this.config = {
      port: config.port || 3000,
      host: config.host || 'localhost',
      maxConnections: config.maxConnections || 100,
      connectionTimeout: config.connectionTimeout || 30000,
      pingInterval: config.pingInterval || 30000
    };

    // HTTP server
    this.httpServer = http.createServer(this.handleHttpRequest.bind(this));

    // WebSocket server
    this.wss = new WebSocket.Server({ 
      server: this.httpServer,
      // Limit connections
      maxPayload: 1024 * 1024, // 1MB max payload
      clientTracking: true
    });

    // Broadcaster
    this.broadcaster = new WebSocketBroadcaster(this.wss);

    // Active connections
    this.connections = new Map();
  }

  /**
   * Start the chat server
   * @returns {Promise<void>}
   */
  async start() {
    try {
      // Set up WebSocket connection handling
      this.wss.on('connection', this.handleWebSocketConnection.bind(this));

      // Set up server-wide error handling
      this.wss.on('error', this.handleServerError.bind(this));

      // Start HTTP server
      await this.startHttpServer();

      // Log server start
      await AuditModel.log({
        action: 'server_start',
        details: {
          host: this.config.host,
          port: this.config.port
        }
      });

      console.log(`MCP Messenger Chat Server running on ${this.config.host}:${this.config.port}`);
    } catch (error) {
      console.error('Server startup failed:', error);
      
      // Log startup failure
      await AuditModel.log({
        action: 'server_start_failed',
        details: { 
          error: error.message 
        }
      });

      process.exit(1);
    }
  }

  /**
   * Start HTTP server
   * @returns {Promise<void>}
   */
  startHttpServer() {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(
        this.config.port, 
        this.config.host, 
        () => resolve()
      );

      this.httpServer.on('error', (error) => {
        console.error('HTTP Server error:', error);
        reject(error);
      });
    });
  }

  /**
   * Handle HTTP requests
   * @param {http.IncomingMessage} req - HTTP request
   * @param {http.ServerResponse} res - HTTP response
   */
  handleHttpRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);

    // Basic health check endpoint
    if (parsedUrl.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // For WebSocket connections, do nothing
    // WebSocket upgrade is handled automatically by ws library
    res.writeHead(404);
    res.end('Not Found');
  }

  /**
   * Handle WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {http.IncomingMessage} req - HTTP request
   */
  async handleWebSocketConnection(ws, req) {
    try {
      // Check connection limit
      if (this.wss.clients.size > this.config.maxConnections) {
        ws.close(1013, 'Server is at maximum capacity');
        return;
      }

      // Authenticate connection
      const user = await WebSocketHandlers.authenticate(ws, req);

      if (!user) {
        ws.close(1008, 'Authentication failed');
        return;
      }

      // Register connection
      this.broadcaster.registerConnection(ws, user);

      // Set up connection event handlers
      ws.on('message', async (message) => {
        try {
          await WebSocketHandlers.handleMessage(ws, user, message);
        } catch (error) {
          console.error('Message handling error:', error);
        }
      });

      ws.on('close', async () => {
        // Remove connection
        this.broadcaster.removeConnection(ws);

        // Log disconnection
        await AuditModel.log({
          userId: user.id,
          action: 'websocket_disconnect',
          details: { reason: 'connection_closed' }
        });
      });

      // Set up ping mechanism to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, this.config.pingInterval);

      // Handle pong responses
      ws.on('pong', () => {
        // Connection is alive
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(1011, 'Unexpected server error');

      // Log connection error
      await AuditModel.log({
        action: 'websocket_connection_failed',
        details: { 
          error: error.message 
        }
      });
    }
  }

  /**
   * Handle server-wide WebSocket errors
   * @param {Error} error - WebSocket server error
   */
  async handleServerError(error) {
    console.error('WebSocket server error:', error);

    // Log server error
    await AuditModel.log({
      action: 'websocket_server_error',
      details: { 
        error: error.message 
      }
    });

    // Broadcast system error if possible
    try {
      await this.broadcaster.broadcastSystemMessage({
        type: 'system_error',
        message: 'Server experiencing technical difficulties'
      });
    } catch (broadcastError) {
      console.error('Error broadcasting system message:', broadcastError);
    }
  }

  /**
   * Graceful shutdown of the server
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      // Log server shutdown
      await AuditModel.log({
        action: 'server_shutdown',
        details: {}
      });

      // Close all WebSocket connections
      this.wss.clients.forEach(ws => {
        ws.close(1001, 'Server shutdown');
      });

      // Close HTTP server
      await new Promise((resolve, reject) => {
        this.httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      console.log('MCP Messenger Chat Server shutdown complete');
    } catch (error) {
      console.error('Server shutdown error:', error);
    }
  }
}

// Export server for use in other modules
module.exports = ChatServer;

// If run directly, start the server
if (require.main === module) {
  const server = new ChatServer();
  server.start();

  // Handle process termination signals
  process.on('SIGTERM', () => server.shutdown());
  process.on('SIGINT', () => server.shutdown());
}