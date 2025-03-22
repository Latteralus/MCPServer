const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const ChatServer = require('./chatServer');
const initializeApiRoutes = require('./api/routes/index');
const config = require('./config');
const db = require('./config/database');

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

    // Create chat server instance using the existing HTTP server
    const chatServer = new ChatServer({
      port: config.port,
      host: 'localhost',
      maxConnections: config.maxConnections,
      connectionTimeout: config.connectionTimeout,
      pingInterval: config.heartbeatInterval
    });

    // Set the existing HTTP server for the chat server instead of creating a new one
    chatServer.httpServer = server;

    // Initialize chat server without starting its own HTTP server
    await chatServer.start(false); // Pass false to indicate not to start a new HTTP server

    // Start HTTP server only once
    const PORT = process.env.PORT || config.port || 3000;
    server.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully');
      await chatServer.shutdown();
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully');
      await chatServer.shutdown();
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();