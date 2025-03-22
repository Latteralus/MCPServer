#!/usr/bin/env node

/**
 * Production startup script for MCP Messenger
 * This script validates the environment, checks database connection,
 * and starts the server with proper error handling
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Check if .env file exists - load if present
if (fs.existsSync('.env')) {
  require('dotenv').config();
  console.log('Environment variables loaded from .env file');
} else {
  console.warn('No .env file found, using default environment variables');
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

console.log('Verifying required files...');
const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));

if (missingFiles.length > 0) {
  console.error('Error: Missing required files:');
  missingFiles.forEach(file => console.error(`- ${file}`));
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

console.log('Verifying directory structure...');
requiredDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Fix any import path issues
console.log('Checking for import path issues...');
try {
  // Look for the fix-imports script, run if exists
  if (fs.existsSync('fix-imports.js')) {
    console.log('Running import path fixer...');
    require('./fix-imports');
  } else {
    console.log('Import path fixer not found, skipping');
  }
} catch (error) {
  console.warn('Warning: Error while fixing import paths:', error.message);
}

// Check Node.js version
const nodeVersion = process.version;
const minVersion = 'v16.0.0';
console.log(`Node.js version: ${nodeVersion}`);

if (compareVersions(nodeVersion, minVersion) < 0) {
  console.error(`Error: Node.js version ${minVersion} or higher is required`);
  process.exit(1);
}

// Check required npm packages
console.log('Verifying npm dependencies...');

try {
  // Check if node_modules exists
  if (!fs.existsSync('node_modules')) {
    console.log('node_modules not found, running npm install...');
    execSync('npm install', { stdio: 'inherit' });
  }
  
  // Check for critical packages
  const requiredPackages = ['ws', 'pg', 'dotenv'];
  
  for (const pkg of requiredPackages) {
    try {
      require.resolve(pkg);
    } catch (e) {
      console.log(`Package ${pkg} not found, installing...`);
      execSync(`npm install ${pkg}`, { stdio: 'inherit' });
    }
  }
} catch (error) {
  console.error('Error installing dependencies:', error.message);
  process.exit(1);
}

// Test database connection
console.log('Testing database connection...');
try {
  const { pool } = require('./config/database');
  
  // Try connecting to database
  pool.query('SELECT NOW()', [], (err, res) => {
    if (err) {
      console.error('Database connection test failed:', err.message);
      console.error(`Check your database settings in .env or config.js`);
      pool.end();
      process.exit(1);
    }
    
    console.log(`Database connection successful`);
    pool.end();
    
    // Start the server
    startServer();
  });
} catch (error) {
  console.error('Error during database check:', error.message);
  process.exit(1);
}

/**
 * Start the chat server
 */
function startServer() {
  try {
    console.log('Starting MCP Messenger Server...');
    const ChatServer = require('./chatServer');
    const config = require('./config');
    
    // Create and start server
    const server = new ChatServer(config);
    server.start();
    
    // Handle termination signals
    process.on('SIGTERM', () => server.shutdown());
    process.on('SIGINT', () => server.shutdown());
    
    console.log('Server startup sequence complete');
  } catch (error) {
    console.error('Fatal error during server startup:', error);
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