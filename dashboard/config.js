// server/dashboard/config.js - Configuration management for admin dashboard
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
      console.log(`Loading admin configuration from ${configFilePath}`);
      const fileConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
      
      // Merge file config with defaults using deep merge for nested properties
      dashboardConfig = deepMerge(dashboardConfig, fileConfig);
      
      console.log('Admin configuration loaded successfully');
    } else {
      console.log('No admin-config.json found, using default configuration');
      
      // Save default config for user reference
      saveConfig();
    }
  } catch (error) {
    console.error('Error loading admin configuration:', error);
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
    console.log(`Saved admin configuration to ${configFilePath}`);
    
    return true;
  } catch (error) {
    console.error('Error saving admin configuration:', error);
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
    console.error('Error getting config value:', error);
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
    console.error('Error setting config value:', error);
    return false;
  }
}

/**
 * Hash a password with SHA-256
 * @param {string} password - Plain text password
 * @returns {string} Password hash
 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Verify a password against the stored hash
 * @param {string} password - Plain text password to verify
 * @param {string} hash - Stored password hash
 * @returns {boolean} Whether password matches
 */
function verifyPassword(password, hash) {
  const passwordHash = hashPassword(password);
  return passwordHash === hash;
}

/**
 * Update admin password
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @returns {boolean} Success status
 */
function updatePassword(oldPassword, newPassword) {
  // Verify old password
  if (!verifyPassword(oldPassword, dashboardConfig.auth.passwordHash)) {
    return false;
  }
  
  // Update password hash
  dashboardConfig.auth.passwordHash = hashPassword(newPassword);
  
  // Save configuration
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