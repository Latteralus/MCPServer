const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const WebSocket = require('ws');
const ChatServer = require('./chatServer');
const initializeApiRoutes = require('./api/routes/index');
const config = require('./config');
const db = require('./config/database');
const logger = require('./config/logger'); // Import logger

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

async function startServer() {
  try {
    // Initialize API routes
    initializeApiRoutes(app);

    // Create chat server instance using the provided configuration
    const chatServer = new ChatServer({
      port: config.port,
      host: 'localhost',
      maxConnections: config.maxConnections,
      connectionTimeout: config.connectionTimeout,
      pingInterval: config.heartbeatInterval
    });

    // Override isLocalNetworkRequest to include IPv6-mapped IPv4 addresses
    chatServer.isLocalNetworkRequest = function(req) {
      const ip = req.socket.remoteAddress;
      return ip === '127.0.0.1' ||
             ip === '::1' ||
             ip === '::ffff:127.0.0.1' ||  // Added check for IPv6-mapped IPv4 address
             ip.startsWith('192.168.') ||
             ip.startsWith('10.') ||
             ip.startsWith('172.16.');
    };

    // Use the existing HTTP server for the chat server
    chatServer.httpServer = server;

    // Create a new WebSocket server on the existing HTTP server
    chatServer.wss = new WebSocket.Server({
      server: server,
      maxPayload: 1024 * 1024,  // 1MB max payload
      clientTracking: true
    });

    // Bind WebSocket connection event with an added log to confirm connection establishment
    chatServer.wss.on('connection', (ws, req) => {
      logger.info({ remoteAddress: req.socket.remoteAddress }, 'WebSocket connection established');
      chatServer.handleWebSocketConnection(ws, req);
    });

    // Initialize chat server without starting its own HTTP server
    await chatServer.start(false); // Pass false to avoid starting a duplicate HTTP server
// Start the shared HTTP server
const PORT = process.env.PORT || config.port || 3000;
server.listen(PORT, () => {
  logger.info(`Server is running on http://localhost:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await chatServer.shutdown();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
}); // Removed extra });

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await chatServer.shutdown();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
} catch (error) {
logger.fatal({ err: error }, 'Failed to start server');
process.exit(1);
}
}

// Start the server
startServer();
