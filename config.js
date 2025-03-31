const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const Joi = require('joi');
// Removed logger import to break circular dependency

// Load environment variables
dotenv.config();

// Define configuration schema with validation, including enhanced database pool settings
const configSchema = Joi.object({
  port: Joi.number().port().default(3000),
  logLevel: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  maxConnections: Joi.number().integer().min(1).max(10000).default(100),
  authenticateUsers: Joi.boolean().default(false),
  connectionTimeout: Joi.number().integer().min(1000).max(600000).default(120000),
  heartbeatInterval: Joi.number().integer().min(1000).max(300000).default(30000),
  allowedNetworkRange: Joi.string().default("192.168.0.0/16"),
  jwt: Joi.object({
    secret: Joi.string().min(32).required(),
    expiresIn: Joi.string().default('24h')
  }).required(),
  database: Joi.object({
    host: Joi.string().required(),
    port: Joi.number().port().default(5432),
    name: Joi.string().required(),
    user: Joi.string().required(),
    password: Joi.string().required(),
    minConnections: Joi.number().integer().min(1).default(5),
    maxConnections: Joi.number().integer().min(1).max(100).default(20),
    acquireTimeoutMillis: Joi.number().integer().min(1000).max(60000).default(10000),
    createTimeoutMillis: Joi.number().integer().min(1000).max(60000).default(30000),
    idleTimeoutMillis: Joi.number().integer().min(1000).max(60000).default(30000),
    reapIntervalMillis: Joi.number().integer().min(100).max(60000).default(1000),
    createRetryIntervalMillis: Joi.number().integer().min(100).max(60000).default(200),
    statement_timeout: Joi.number().integer().min(1000).max(60000).default(30000)
  }).required()
});

// Load default configuration from config.json if available
let defaultConfig = {};
try {
  defaultConfig = require('./config.json');
  console.info('Loaded base configuration from config.json'); // Use console
} catch (error) {
  console.warn('config.json not found, using environment variables only'); // Use console
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

// Create configuration from environment variables
const envConfig = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
  logLevel: process.env.LOG_LEVEL,
  maxConnections: process.env.MAX_CONNECTIONS ? parseInt(process.env.MAX_CONNECTIONS, 10) : undefined,
  authenticateUsers: process.env.AUTHENTICATE_USERS ? process.env.AUTHENTICATE_USERS === 'true' : undefined,
  connectionTimeout: process.env.CONNECTION_TIMEOUT ? parseInt(process.env.CONNECTION_TIMEOUT, 10) : undefined,
  heartbeatInterval: process.env.HEARTBEAT_INTERVAL ? parseInt(process.env.HEARTBEAT_INTERVAL, 10) : undefined,
  allowedNetworkRange: process.env.ALLOWED_NETWORK_RANGE,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN
  },
  database: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    minConnections: process.env.DB_MIN_CONNECTIONS ? parseInt(process.env.DB_MIN_CONNECTIONS, 10) : undefined,
    maxConnections: process.env.DB_MAX_CONNECTIONS ? parseInt(process.env.DB_MAX_CONNECTIONS, 10) : undefined,
    acquireTimeoutMillis: process.env.DB_ACQUIRE_TIMEOUT ? parseInt(process.env.DB_ACQUIRE_TIMEOUT, 10) : undefined,
    createTimeoutMillis: process.env.DB_CREATE_TIMEOUT ? parseInt(process.env.DB_CREATE_TIMEOUT, 10) : undefined,
    idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT ? parseInt(process.env.DB_IDLE_TIMEOUT, 10) : undefined,
    reapIntervalMillis: process.env.DB_REAP_INTERVAL ? parseInt(process.env.DB_REAP_INTERVAL, 10) : undefined,
    createRetryIntervalMillis: process.env.DB_RETRY_INTERVAL ? parseInt(process.env.DB_RETRY_INTERVAL, 10) : undefined,
    statement_timeout: process.env.DB_QUERY_TIMEOUT ? parseInt(process.env.DB_QUERY_TIMEOUT, 10) : undefined
  }
};

// Utility function to remove undefined values for proper merging
const cleanObject = (obj) => {
  const cleanedObj = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        const cleaned = cleanObject(value);
        if (Object.keys(cleaned).length > 0) {
          cleanedObj[key] = cleaned;
        }
      } else {
        cleanedObj[key] = value;
      }
    }
  });
  return cleanedObj;
};

const cleanedEnvConfig = cleanObject(envConfig);

// Deep merge function for nested objects
const deepMerge = (target, source) => {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
};

// Helper to check if a value is an object
function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

// Merge default configuration with environment variables
const mergedConfig = deepMerge(defaultConfig, cleanedEnvConfig);

// Validate the merged configuration
const { error, value: validatedConfig } = configSchema.validate(mergedConfig, {
  abortEarly: false,
  allowUnknown: false,
  stripUnknown: true
});
// Handle validation errors
if (error) {
  console.error('FATAL: Configuration validation failed:'); // Use console.error
  error.details.forEach(detail => {
    console.error(`- ${detail.message}`); // Use console.error
  });
  throw new Error('Invalid configuration. Application cannot start.');
}

// Check for security-critical settings
if (!validatedConfig.jwt.secret) {
  throw new Error('JWT_SECRET is required but not provided. Application cannot start.');
}

// Log the sanitized configuration (with sensitive data redacted)
const sanitizedConfig = { ...validatedConfig };
if (sanitizedConfig.jwt) {
  sanitizedConfig.jwt = { ...sanitizedConfig.jwt, secret: '[REDACTED]' };
}
if (sanitizedConfig.database) {
  sanitizedConfig.database = { ...sanitizedConfig.database, password: '[REDACTED]' };
}
 
console.info('Application configuration loaded:', sanitizedConfig); // Use console
 
module.exports = validatedConfig;
