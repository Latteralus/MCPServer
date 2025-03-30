// server/dashboard/config.js - Configuration management for admin dashboard
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const argon2 = require('argon2'); // Added for secure password hashing
const logger = require('../config/logger'); // Import logger

// Get main app directory
const { getAppDirectory } = require('../adminDashboard');

// Default admin dashboard configuration
let dashboardConfig = {
  // Admin authentication
  auth: {
    // Default admin username and password hash (change these in admin-config.json)
    username: 'admin',
    // Default password: 'admin123' (this is just the hash)
    passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
    sessionDuration: 60 * 60 * 1000, // 1 hour
    maxFailedAttempts: 5,
    lockoutDuration: 15 * 60 * 1000 // 15 minutes
  },
  
  // Dashboard settings
  ui: {
    refreshInterval: 5000, // 5 seconds
    maxLogEntries: 100,
    showDetailedLogs: false,
    enableRemoteControl: true,
    theme: 'light'
  },
  
  // Audit settings
  audit: {
    logActions: true,
    logAdminActions: true,
    logRetentionDays: 30
  },
  
  // Security settings
  security: {
    allowRemoteAccess: false,
    requireHTTPS: false,
    sessionIdleTimeout: 30 * 60 * 1000 // 30 minutes
  },
  
  // Feature toggles
  features: {
    userManagement: true,
    messageModeration: true,
    systemMetrics: true,
    logExport: true
  }
};

/**
 * Load dashboard configuration from file
 */
function loadConfig() {
  try {
    const configFilePath = path.join(
      process.pkg ? path.dirname(process.execPath) : __dirname, 
      '..', 
      'admin-config.json'
    );
    
    if (fs.existsSync(configFilePath)) {
      logger.info(`Loading admin configuration from ${configFilePath}`);
      const fileConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
      
      // Merge file config with defaults using deep merge for nested properties
      dashboardConfig = deepMerge(dashboardConfig, fileConfig);
      
      logger.info('Admin configuration loaded successfully');
    } else {
      logger.info('No admin-config.json found, using default configuration');
      
      // Save default config for user reference
      saveConfig();
    }
  } catch (error) {
    logger.error({ err: error }, 'Error loading admin configuration');
  }
}

/**
 * Save current configuration to file
 */
function saveConfig() {
  try {
    const configFilePath = path.join(
      process.pkg ? path.dirname(process.execPath) : __dirname, 
      '..', 
      'admin-config.json'
    );
    
    // Create backup of existing config if it exists
    if (fs.existsSync(configFilePath)) {
      const backupPath = `${configFilePath}.bak`;
      fs.copyFileSync(configFilePath, backupPath);
    }
    
    // Save current config
    fs.writeFileSync(configFilePath, JSON.stringify(dashboardConfig, null, 2), 'utf8');
    logger.info(`Saved admin configuration to ${configFilePath}`);
    
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Error saving admin configuration');
    return false;
  }
}

/**
 * Get configuration value
 * @param {string} path - Dot-notation path to config value
 * @param {any} defaultValue - Default value if path not found
 * @returns {any} Configuration value
 */
function getConfig(path, defaultValue = null) {
  try {
    // Split path into segments
    const segments = path.split('.');
    
    // Start with the full config object
    let current = dashboardConfig;
    
    // Traverse the path
    for (const segment of segments) {
      if (current && typeof current === 'object' && segment in current) {
        current = current[segment];
      } else {
        return defaultValue;
      }
    }
    
    return current;
  } catch (error) {
    logger.error({ err: error, path }, 'Error getting config value');
    return defaultValue;
  }
}

/**
 * Set configuration value
 * @param {string} path - Dot-notation path to config value
 * @param {any} value - New value
 * @returns {boolean} Success status
 */
function setConfig(path, value) {
  try {
    // Split path into segments
    const segments = path.split('.');
    
    // Start with the full config object
    let current = dashboardConfig;
    
    // Traverse the path until the second-to-last segment
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      
      if (!(segment in current)) {
        current[segment] = {};
      }
      
      current = current[segment];
    }
    
    // Set the value at the last segment
    const lastSegment = segments[segments.length - 1];
    current[lastSegment] = value;
    
    return true;
  } catch (error) {
    logger.error({ err: error, path, value }, 'Error setting config value');
    return false;
  }
}

/**
 * Hash a password securely using Argon2id
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Password hash
 */
async function hashPassword(password) {
  try {
    // Use Argon2id for strong hashing
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 16384, // 16 MB
      timeCost: 3,
      parallelism: 2
    });
  } catch (error) {
    logger.error({ err: error }, 'Error hashing password');
    throw new Error('Password hashing failed');
  }
}

/**
 * Verify a password against the stored Argon2 hash
 * @param {string} password - Plain text password to verify
 * @param {string} hash - Stored password hash
 * @returns {Promise<boolean>} Whether password matches
 */
async function verifyPassword(password, hash) {
  if (!hash) {
    // Handle case where hash might be missing (e.g., initial setup)
    logger.warn('Attempted to verify password against an empty hash.');
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    // Log error but treat as verification failure
    logger.error({ err: error }, 'Error verifying password');
    return false;
  }
}

/**
 * Update admin password using Argon2
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<boolean>} Success status
 */
async function updatePassword(oldPassword, newPassword) {
  // Get current hash (might be missing if just initialized)
  const currentHash = getConfig('auth.passwordHash', null);

  // Verify old password
  const isOldPasswordValid = await verifyPassword(oldPassword, currentHash);
  if (!isOldPasswordValid) {
    logger.warn('Admin password update failed: Incorrect current password.');
    return false;
  }
  
  // Hash the new password
  const newPasswordHash = await hashPassword(newPassword);
  
  // Update password hash in config object
  setConfig('auth.passwordHash', newPasswordHash);
  
  // Save configuration to file
  return saveConfig();
}

/**
 * Deep merge two objects
 * @param {object} target - Target object
 * @param {object} source - Source object
 * @returns {object} Merged object
 */
function deepMerge(target, source) {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  
  return output;
}

/**
 * Check if value is an object
 * @param {any} item - Value to check
 * @returns {boolean} Whether value is an object
 */
function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

module.exports = {
  loadConfig,
  saveConfig,
  getConfig,
  setConfig,
  hashPassword,
  verifyPassword,
  updatePassword
};