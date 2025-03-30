#!/usr/bin/env node

/**
 * Production startup script for MCP Messenger
 * This script validates the environment, checks database connection,
 * and starts the server with proper error handling
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const logger = require('./config/logger'); // Import the logger

// Check if .env file exists - load if present
if (fs.existsSync('.env')) {
  require('dotenv').config();
  logger.info('Environment variables loaded from .env file');
} else {
  logger.warn('No .env file found, using default environment variables');
}

// Verify required files exist
const requiredFiles = [
  'chatServer.js',
  'config.js',
  'config/database.js',
  'services/authService.js',
  'services/permissionService.js',
  'websocket/broadcaster.js',
  'websocket/handlers.js'
];

logger.info('Verifying required files...');
const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));


if (missingFiles.length > 0) {
  logger.fatal({ missingFiles }, 'Error: Missing required files. Cannot start.');
  // Log each missing file individually for clarity if needed, but the object above is structured.
  // missingFiles.forEach(file => logger.error(`- Missing file: ${file}`));
  process.exit(1);
}
// Verify directory structure
const requiredDirs = [
  'models',
  'services',
  'websocket',
  'api',
  'config',
  'logs'
];

logger.info('Verifying directory structure...');
requiredDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    logger.info({ directory: dir }, `Creating directory`);
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Fix any import path issues
logger.info('Checking for import path issues...');
try {
  // Look for the fix-imports script, run if exists
  if (fs.existsSync('fix-imports.js')) {
    logger.info('Running import path fixer...');
    require('./fix-imports');
  } else {
    logger.info('Import path fixer not found, skipping');
  }
} catch (error) {
  logger.warn({ err: error }, 'Warning: Error while fixing import paths');
}

// Check Node.js version
const nodeVersion = process.version;
const minVersion = 'v16.0.0';
logger.info(`Node.js version: ${nodeVersion}`);

if (compareVersions(nodeVersion, minVersion) < 0) {
  logger.fatal(`Error: Node.js version ${minVersion} or higher is required. Found: ${nodeVersion}`);
  process.exit(1);
}

// Check required npm packages
logger.info('Verifying npm dependencies...');

try {
  // Check if node_modules exists
  if (!fs.existsSync('node_modules')) {
    logger.info('node_modules not found, running npm install...');
    execSync('npm install', { stdio: 'inherit' });
  }
  
  // Check for critical packages
  const requiredPackages = ['ws', 'pg', 'dotenv'];
  
  for (const pkg of requiredPackages) {
    try {
      require.resolve(pkg);
    } catch (e) {
      logger.info({ package: pkg }, `Package not found, installing...`);
      execSync(`npm install ${pkg}`, { stdio: 'inherit' });
    }
  }
} catch (error) {
  logger.fatal({ err: error }, 'Error installing dependencies');
  process.exit(1);
}

// Test database connection
logger.info('Testing database connection...');
try {
  const { pool } = require('./config/database');
  
  // Try connecting to database
  pool.query('SELECT NOW()', [], (err, res) => {
    if (err) {
      logger.fatal({ err }, 'Database connection test failed');
      logger.error(`Check your database settings in .env or config.js`);
      pool.end();
      process.exit(1);
    }
    
    logger.info(`Database connection successful`);
    pool.end();
    
    // Start the server
    startServer();
  });
} catch (error) {
  logger.fatal({ err: error }, 'Error during database check');
  process.exit(1);
}

/**
 * Start the chat server
 */
function startServer() {
  try {
    logger.info('Starting MCP Messenger Server...');
    const ChatServer = require('./chatServer');
    const config = require('./config');
    
    // Create and start server
    const server = new ChatServer(config);
    server.start();
    
    // Handle termination signals
    process.on('SIGTERM', () => server.shutdown());
    process.on('SIGINT', () => server.shutdown());
    
    logger.info('Server startup sequence complete');
  } catch (error) {
    logger.fatal({ err: error }, 'Fatal error during server startup');
    process.exit(1);
  }
}

/**
 * Compare semver versions
 * @param {string} a - First version
 * @param {string} b - Second version
 * @returns {number} Comparison result (-1, 0, 1)
 */
function compareVersions(a, b) {
  const partsA = a.replace(/[^\d.]/g, '').split('.');
  const partsB = b.replace(/[^\d.]/g, '').split('.');
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = parseInt(partsA[i] || 0);
    const numB = parseInt(partsB[i] || 0);
    
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  
  return 0;
}