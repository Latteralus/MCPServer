const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Load default configuration from config.json
let defaultConfig = {};
try {
  defaultConfig = require('./config.json');
} catch (error) {
  console.warn('config.json not found, using environment variables only');
  defaultConfig = {
    port: 3000,
    logLevel: "info",
    maxConnections: 100,
    authenticateUsers: false,
    connectionTimeout: 120000,
    heartbeatInterval: 30000,
    allowedNetworkRange: "192.168.0.0/16"
  };
}

// Create an object for environment overrides
const envConfig = {
  port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
  logLevel: process.env.LOG_LEVEL,
  maxConnections: process.env.MAX_CONNECTIONS ? parseInt(process.env.MAX_CONNECTIONS) : undefined,
  authenticateUsers: process.env.AUTHENTICATE_USERS === 'true',
  connectionTimeout: process.env.CONNECTION_TIMEOUT ? parseInt(process.env.CONNECTION_TIMEOUT) : undefined,
  heartbeatInterval: process.env.HEARTBEAT_INTERVAL ? parseInt(process.env.HEARTBEAT_INTERVAL) : undefined,
  allowedNetworkRange: process.env.ALLOWED_NETWORK_RANGE,
  
  // Database config
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
    name: process.env.DB_NAME || 'mcp_messenger_db',
    user: process.env.DB_USER || 'mcp_messenger_admin',
    password: process.env.DB_PASSWORD || 'admin123',
    maxConnections: process.env.DB_MAX_CONNECTIONS ? parseInt(process.env.DB_MAX_CONNECTIONS) : 10
  }
};

// Remove any undefined overrides
Object.keys(envConfig).forEach(key => {
  if (envConfig[key] === undefined || envConfig[key] === null) {
    delete envConfig[key];
  }
});

// Merge the default config with environment-specific overrides
const config = {
  ...defaultConfig,
  ...envConfig
};

module.exports = config;