// server/dashboard/audit.js - Audit logging for admin dashboard
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');
const { getAppDirectory } = require('../adminDashboard');
const logger = require('../config/logger'); // Import logger

/**
 * Log an admin action
 * @param {string} username - Username who performed the action
 * @param {string} action - Action type 
 * @param {object} details - Additional details
 * @returns {boolean} Success status
 */
function logAction(username, action, details = {}) {
  // Check if action logging is enabled
  const logActions = getConfig('audit.logActions', true);
  if (!logActions) return true;
  
  // Check if admin actions should be logged
  const logAdminActions = getConfig('audit.logAdminActions', true);
  const adminUsername = getConfig('auth.username');
  
  if (!logAdminActions && username === adminUsername) return true;
  
  try {
    // Create log entry
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      username,
      action,
      details
    };
    
    // Get log directory
    const appDirectory = getAppDirectory();
    const adminLogDirectory = path.join(appDirectory, 'logs', 'admin');
    
    // Ensure log directory exists
    if (!fs.existsSync(adminLogDirectory)) {
      fs.mkdirSync(adminLogDirectory, { recursive: true });
    }
    
    // Log file path - create a new log file for each day
    const logFilePath = path.join(adminLogDirectory, `admin_${new Date().toISOString().slice(0, 10)}.log`);
    
    // Append to log file
    fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n');
    
    return true;
  } catch (error) {
    logger.error({ err: error, username, action, details }, 'Error writing to admin audit log file');
    return false;
  }
}

/**
 * Get admin audit logs
 * @param {object} options - Filter options
 * @param {string} options.date - Date in YYYY-MM-DD format
 * @param {string} options.username - Filter by username
 * @param {string} options.action - Filter by action
 * @param {number} options.limit - Maximum number of entries to return
 * @param {number} options.offset - Offset for pagination
 * @returns {object} Logs and metadata
 */
function getAdminLogs(options = {}) {
  try {
    const appDirectory = getAppDirectory();
    const adminLogDirectory = path.join(appDirectory, 'logs', 'admin');
    
    // Ensure log directory exists
    if (!fs.existsSync(adminLogDirectory)) {
      return { logs: [], total: 0, page: 1, totalPages: 0 };
    }
    
    // Default options
    const date = options.date || new Date().toISOString().slice(0, 10);
    const username = options.username;
    const action = options.action;
    const limit = options.limit || getConfig('ui.maxLogEntries', 100);
    const offset = options.offset || 0;
    const page = Math.floor(offset / limit) + 1;
    
    // Log file path
    const logFilePath = path.join(adminLogDirectory, `admin_${date}.log`);
    
    // Check if log file exists
    if (!fs.existsSync(logFilePath)) {
      return { logs: [], total: 0, page, totalPages: 0 };
    }
    
    // Read log file
    const logData = fs.readFileSync(logFilePath, 'utf8');
    const logLines = logData.trim().split('\n');
    
    // Parse each line as JSON
    let logs = logLines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(log => log !== null);
    
    // Apply filters
    if (username) {
      logs = logs.filter(log => log.username === username);
    }
    
    if (action) {
      logs = logs.filter(log => log.action === action);
    }
    
    // Sort logs by timestamp descending (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Get total count
    const total = logs.length;
    
    // Apply pagination
    logs = logs.slice(offset, offset + limit);
    
    // Calculate total pages
    const totalPages = Math.ceil(total / limit);
    
    return {
      logs,
      total,
      page,
      totalPages
    };
  } catch (error) {
    logger.error({ err: error, options }, 'Error reading admin logs');
    return { logs: [], total: 0, page: 1, totalPages: 0, error: error.message };
  }
}

/**
 * Get available log dates
 * @returns {string[]} Array of dates in YYYY-MM-DD format
 */
function getLogDates() {
  try {
    const appDirectory = getAppDirectory();
    const adminLogDirectory = path.join(appDirectory, 'logs', 'admin');
    
    // Ensure log directory exists
    if (!fs.existsSync(adminLogDirectory)) {
      return [];
    }
    
    // Get all log files
    const files = fs.readdirSync(adminLogDirectory);
    
    // Extract dates from filenames
    const dates = files
      .filter(file => file.startsWith('admin_') && file.endsWith('.log'))
      .map(file => file.slice(6, 16)) // Extract YYYY-MM-DD part
      .sort((a, b) => new Date(b) - new Date(a)); // Sort newest first
    
    return dates;
  } catch (error) {
    logger.error({ err: error }, 'Error getting admin log dates');
    return [];
  }
}

/**
 * Export logs to a file
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} format - Export format (json or csv)
 * @returns {string|null} Path to exported file or null on error
 */
function exportLogs(date, format = 'json') {
  try {
    const appDirectory = getAppDirectory();
    const adminLogDirectory = path.join(appDirectory, 'logs', 'admin');
    const exportDirectory = path.join(appDirectory, 'exports');
    
    // Ensure export directory exists
    if (!fs.existsSync(exportDirectory)) {
      fs.mkdirSync(exportDirectory, { recursive: true });
    }
    
    // Log file path
    const logFilePath = path.join(adminLogDirectory, `admin_${date}.log`);
    
    // Check if log file exists
    if (!fs.existsSync(logFilePath)) {
      return null;
    }
    
    // Read log file
    const logData = fs.readFileSync(logFilePath, 'utf8');
    const logLines = logData.trim().split('\n');
    
    // Parse each line as JSON
    const logs = logLines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(log => log !== null);
    
    // Generate export filename
    const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    const exportFilename = `admin_logs_${date}_export_${timestamp}.${format}`;
    const exportPath = path.join(exportDirectory, exportFilename);
    
    // Export based on format
    if (format === 'json') {
      fs.writeFileSync(exportPath, JSON.stringify(logs, null, 2), 'utf8');
    } else if (format === 'csv') {
      // Create CSV header
      let csv = 'Timestamp,Username,Action,Details\n';
      
      // Add each log entry
      logs.forEach(log => {
        const details = JSON.stringify(log.details).replace(/"/g, '""');
        csv += `"${log.timestamp}","${log.username}","${log.action}","${details}"\n`;
      });
      
      fs.writeFileSync(exportPath, csv, 'utf8');
    } else {
      return null;
    }
    
    return exportPath;
  } catch (error) {
    logger.error({ err: error, date, format }, 'Error exporting admin logs');
    return null;
  }
}

/**
 * Clean up old audit logs
 * @returns {number} Number of files removed
 */
function cleanupOldLogs() {
  try {
    const retentionDays = getConfig('audit.logRetentionDays', 30);
    const appDirectory = getAppDirectory();
    const adminLogDirectory = path.join(appDirectory, 'logs', 'admin');
    
    // Ensure log directory exists
    if (!fs.existsSync(adminLogDirectory)) {
      return 0;
    }
    
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    // Get all log files
    const files = fs.readdirSync(adminLogDirectory);
    
    // Identify old log files
    const oldFiles = files.filter(file => {
      try {
        if (!file.startsWith('admin_') || !file.endsWith('.log')) return false;
        
        // Extract date from filename
        const dateStr = file.slice(6, 16); // Extract YYYY-MM-DD part
        const fileDate = new Date(dateStr);
        
        // Compare with cutoff date
        return fileDate < cutoffDate;
      } catch (e) {
        return false;
      }
    });
    
    // Delete old files
    let removedCount = 0;
    oldFiles.forEach(file => {
      try {
        fs.unlinkSync(path.join(adminLogDirectory, file));
        removedCount++;
      } catch (e) {
        logger.error({ err: e, file }, `Error deleting old log file`);
      }
    });
    
    return removedCount;
  } catch (error) {
    logger.error({ err: error }, 'Error cleaning up old admin logs');
    return 0;
  }
}

// Export audit functions
module.exports = {
  logAction,
  getAdminLogs,
  getLogDates,
  exportLogs,
  cleanupOldLogs
};