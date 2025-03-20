const fs = require('fs');
const path = require('path');

// Load default configuration from config.json
const defaultConfig = require('./config.json');

// Optionally, load environment variables from a .env file (if using dotenv)
// require('dotenv').config();

// Create an object for environment overrides
const envConfig = {
  port: process.env.PORT,
  logLevel: process.env.LOG_LEVEL,
  maxConnections: process.env.MAX_CONNECTIONS,
  authenticateUsers: process.env.AUTHENTICATE_USERS === 'true',
  connectionTimeout: process.env.CONNECTION_TIMEOUT,
  heartbeatInterval: process.env.HEARTBEAT_INTERVAL,
  allowedNetworkRange: process.env.ALLOWED_NETWORK_RANGE
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
