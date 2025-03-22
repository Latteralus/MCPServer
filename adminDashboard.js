const path = require('path');
const fs = require('fs');

/**
 * Get the application directory path
 * @returns {string} App directory path
 */
function getAppDirectory() {
  // In packaged app, use the executable directory
  if (process.pkg) {
    return path.dirname(process.execPath);
  }
  
  // In development, use the current directory
  return process.cwd();
}

/**
 * Initialize admin dashboard
 * @param {object} server - HTTP server instance
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 * @param {object} serverConfig - Server configuration
 */
function initializeAdminDashboard(server, wss, clients, serverConfig) {
  // Ensure logs directory exists
  const appDirectory = getAppDirectory();
  const logsDirectory = path.join(appDirectory, 'logs');
  const adminLogsDirectory = path.join(logsDirectory, 'admin');
  
  if (!fs.existsSync(logsDirectory)) {
    fs.mkdirSync(logsDirectory, { recursive: true });
  }
  
  if (!fs.existsSync(adminLogsDirectory)) {
    fs.mkdirSync(adminLogsDirectory, { recursive: true });
  }
  
  // Initialize dashboard components
  try {
    const { loadConfig } = require('./dashboard/config');
    const { setupHttpRoutes } = require('./dashboard/http');
    const { setupWebSocket } = require('./dashboard/websocket');
    const { startMetricsCollection } = require('./dashboard/metrics');
    
    // Load dashboard configuration
    loadConfig();
    
    // Setup HTTP routes
    setupHttpRoutes(server, wss, clients, serverConfig);
    
    // Setup WebSocket handling
    setupWebSocket(wss, clients, serverConfig, (message) => {
      // Broadcast function for admin dashboard
      wss.clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify(message));
        }
      });
    });
    
    // Start metrics collection
    startMetricsCollection(wss, clients);
    
    console.log('Admin dashboard initialized successfully');
  } catch (error) {
    console.error('Error initializing admin dashboard:', error);
  }
}

module.exports = {
  initializeAdminDashboard,
  getAppDirectory
};