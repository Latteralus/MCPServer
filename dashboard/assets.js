// server/dashboard/assets.js - Static asset handling for admin dashboard
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger'); // Import logger

/**
 * Serve dashboard assets
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {string} pathname - Request path
 */
function serveAssets(req, res, pathname) {
  // Extract filename from path
  const filename = pathname.replace('/admin/assets/', '');
  
  // Only allow CSS and JS files
  if (!filename.endsWith('.css') && !filename.endsWith('.js')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  
  // Determine content type
  const contentType = filename.endsWith('.css') 
    ? 'text/css' 
    : 'application/javascript';
  
  // Check if file exists in our collections
  if (filename.endsWith('.css') && CSS_FILES[filename]) {
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(CSS_FILES[filename]);
    return;
  }
  
  if (filename.endsWith('.js') && JS_FILES[filename]) {
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(JS_FILES[filename]);
    return;
  }
  
  // File not found
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('File not found');
}

/**
 * CSS files for dashboard
 */
const CSS_FILES = {
  'dashboard.css': `/* Dashboard styles */
body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 0;
  background-color: #f5f5f5;
}
.container {
  display: flex;
  min-height: 100vh;
}
.sidebar {
  width: 250px;
  background-color: #2c3e50;
  color: white;
  padding: 20px 0;
}
.sidebar-header {
  padding: 0 20px;
  margin-bottom: 30px;
}
.sidebar-header h1 {
  margin: 0;
  font-size: 1.5em;
}
.sidebar-menu {
  list-style: none;
  padding: 0;
  margin: 0;
}
.sidebar-menu li {
  padding: 12px 20px;
  cursor: pointer;
  transition: background-color 0.3s;
  display: flex;
  align-items: center;
}
.sidebar-menu li:hover, .sidebar-menu li.active {
  background-color: #34495e;
}
.sidebar-menu li .icon {
  margin-right: 10px;
  font-size: 18px;
}
.main-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 20px;
  border-bottom: 1px solid #ddd;
  margin-bottom: 20px;
}
.user-info {
  display: flex;
  align-items: center;
}
.page-title {
  font-size: 1.5em;
  margin: 0;
}
.card {
  background-color: white;
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
  overflow: hidden;
}
.card-header {
  padding: 15px 20px;
  background-color: #f9f9f9;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-header h2 {
  margin: 0;
  font-size: 1.2em;
}
.card-body {
  padding: 20px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}
.stat-card {
  background-color: white;
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  padding: 20px;
  text-align: center;
}
.stat-card h3 {
  margin: 0 0 10px 0;
  color: #888;
  font-weight: normal;
}
.stat-card .value {
  font-size: 2em;
  font-weight: bold;
  color: #2196F3;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  padding: 12px 15px;
  text-align: left;
  border-bottom: 1px solid #eee;
}
th {
  background-color: #f9f9f9;
  font-weight: bold;
}
tr:hover {
  background-color: #f5f5f5;
}
.btn {
  display: inline-block;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  border: none;
  font-size: 14px;
}
.btn-primary {
  background-color: #2196F3;
  color: white;
}
.btn-primary:hover {
  background-color: #0b7dda;
}
.btn-danger {
  background-color: #f44336;
  color: white;
}
.btn-danger:hover {
  background-color: #da190b;
}
.btn-warning {
  background-color: #ff9800;
  color: white;
}
.btn-warning:hover {
  background-color: #e68a00;
}
.btn-success {
  background-color: #4CAF50;
  color: white;
}
.btn-success:hover {
  background-color: #3e8e41;
}
.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}
.badge {
  display: inline-block;
  padding: 3px 7px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: bold;
}
.badge-success {
  background-color: #4CAF50;
  color: white;
}
.badge-warning {
  background-color: #ff9800;
  color: white;
}
.badge-danger {
  background-color: #f44336;
  color: white;
}
#connectionStatus {
  margin-top: 20px;
  text-align: center;
  padding: 10px;
  font-weight: bold;
}
.status-indicator {
  display: inline-block;
  padding: 5px 10px;
  border-radius: 20px;
}
.online {
  color: #4CAF50;
}
.offline {
  color: #f44336;
}
.modal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}
.modal-content {
  background-color: white;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 500px;
}
.modal-header {
  padding: 15px 20px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header h2 {
  margin: 0;
  font-size: 1.2em;
}
.modal-body {
  padding: 20px;
}
.modal-footer {
  padding: 15px 20px;
  border-top: 1px solid #eee;
  text-align: right;
}
.close {
  color: #aaa;
  float: right;
  font-size: 28px;
  font-weight: bold;
  cursor: pointer;
  margin-left: 15px;
}
.close:hover {
  color: black;
}
.form-group {
  margin-bottom: 15px;
}
.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}
.form-control {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}
.form-check {
  margin-bottom: 15px;
}
.form-check label {
  display: inline-block;
  margin-left: 5px;
}
.alert {
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 15px;
}
.alert-success {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}
.alert-danger {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}
.alert-warning {
  background-color: #fff3cd;
  color: #856404;
  border: 1px solid #ffeeba;
}
.chart-container {
  position: relative;
  height: 300px;
  margin-bottom: 20px;
}
.loader-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
}
.loader {
  display: inline-block;
  width: 40px;
  height: 40px;
  border: 3px solid rgba(0,0,0,0.1);
  border-radius: 50%;
  border-top-color: #2196F3;
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 15px;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
#chatLog {
  height: 400px;
  overflow-y: auto;
  padding: 10px;
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
  white-space: pre-wrap;
}
.log-entry {
  padding: 8px;
  border-bottom: 1px solid #eee;
  line-height: 1.4;
}
.log-entry:nth-child(odd) {
  background-color: rgba(0,0,0,0.02);
}
.log-time {
  color: #888;
  font-size: 12px;
}
.log-level-info {
  color: #2196F3;
}
.log-level-warn {
  color: #ff9800;
}
.log-level-error {
  color: #f44336;
}
.filter-container {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}
.filter-container select,
.filter-container input {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}
.tabs {
  display: flex;
  border-bottom: 1px solid #ddd;
  margin-bottom: 20px;
}
.tab {
  padding: 10px 15px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tab.active {
  border-bottom-color: #2196F3;
  color: #2196F3;
  font-weight: bold;
}
.tab-content {
  display: none;
}
.tab-content.active {
  display: block;
}
@media (max-width: 768px) {
  .container {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    padding: 10px 0;
  }
  .grid {
    grid-template-columns: 1fr;
  }
  .card-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .card-header > div {
    margin-top: 10px;
  }
}`,

  'login.css': `/* Login page styles */
body {
  font-family: Arial, sans-serif;
  background-color: #f5f5f5;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  margin: 0;
}
.login-container {
  background-color: white;
  padding: 30px;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  width: 350px;
}
h1 {
  text-align: center;
  color: #2196F3;
  margin-bottom: 30px;
}
.form-group {
  margin-bottom: 20px;
}
label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}
input[type="text"],
input[type="password"] {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 14px;
  box-sizing: border-box;
}
.submit-btn {
  width: 100%;
  padding: 10px;
  background-color: #2196F3;
  border: none;
  color: white;
  font-weight: bold;
  border-radius: 3px;
  cursor: pointer;
}
.submit-btn:hover {
  background-color: #1976D2;
}
.error {
  color: #f44336;
  margin-top: 20px;
  text-align: center;
}
@media (max-width: 400px) {
  .login-container {
    width: 100%;
    border-radius: 0;
    box-shadow: none;
  }
}`
};

/**
 * JavaScript files for dashboard
 */
const JS_FILES = {
  'dashboard.js': `// Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const sidebarMenuItems = document.querySelectorAll('.sidebar-menu li');
  const pageTitle = document.querySelector('.page-title');
  const pageContent = document.getElementById('pageContent');
  const logoutBtn = document.getElementById('logoutBtn');
  const connectionStatus = document.getElementById('connectionStatus');
  const modalContainer = document.getElementById('modalContainer');
  const modalClose = document.querySelector('.close');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalFooter = document.getElementById('modalFooter');
  
  // Dashboard state
  let currentPage = 'dashboard';
  let websocket = null;
  let refreshInterval = null;
  
  // Page content cache
  const pageCache = {};
  
  // Initialize dashboard
  initDashboard();
  
  /**
   * Initialize the dashboard
   */
  function initDashboard() {
    // Set up menu click handlers
    sidebarMenuItems.forEach(item => {
      if (item.id !== 'logoutBtn') {
        item.addEventListener('click', function() {
          const page = this.getAttribute('data-page');
          if (page !== currentPage) {
            loadPage(page);
          }
        });
      }
    });
    
    // Set up logout button
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        window.location.href = '/admin/logout';
      });
    }
    
    // Set up modal close button
    if (modalClose) {
      modalClose.addEventListener('click', function() {
        closeModal();
      });
    }
    
    // Click outside modal to close
    window.addEventListener('click', function(event) {
      if (event.target === modalContainer) {
        closeModal();
      }
    });
    
    // Connect to WebSocket for real-time updates
    connectWebSocket();
    
    // Load initial page
    loadPage('dashboard');
    
    // Set refresh interval for metrics
    startRefreshInterval();
  }
  
  /**
   * Connect to WebSocket for real-time updates
   */
  function connectWebSocket() {
    // Check if WebSocket is already connected
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      return;
    }
    
    // Get current host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = \`\${protocol}//\${window.location.host}/admin/ws\`;
    
    // Create WebSocket connection
    websocket = new WebSocket(wsUrl);
    
    // Connection opened
    websocket.addEventListener('open', function() {
      updateConnectionStatus(true);
      logger.info('Admin Dashboard WebSocket connected');
    });
    
    // Connection closed
    websocket.addEventListener('close', function() {
      updateConnectionStatus(false);
      logger.info('Admin Dashboard WebSocket disconnected');
      
      // Try to reconnect after delay
      setTimeout(connectWebSocket, 5000);
    });
    
    // Connection error
    websocket.addEventListener('error', function(error) {
      updateConnectionStatus(false);
      logger.error({ err: error }, 'Admin Dashboard WebSocket error');
    });
    
    // Listen for messages
    websocket.addEventListener('message', function(event) {
      handleWebSocketMessage(event.data);
    });
  }
  
  /**
   * Update connection status display
   * @param {boolean} isConnected - Whether WebSocket is connected
   */
  function updateConnectionStatus(isConnected) {
    const statusIndicator = connectionStatus.querySelector('.status-indicator');
    
    if (isConnected) {
      statusIndicator.className = 'status-indicator online';
      statusIndicator.innerHTML = '• Connected';
    } else {
      statusIndicator.className = 'status-indicator offline';
      statusIndicator.innerHTML = '• Disconnected';
    }
  }
  
  /**
   * Handle WebSocket messages
   * @param {string} data - Message data
   */
  function handleWebSocketMessage(data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'metrics':
          updateMetrics(message.data);
          break;
        case 'user_update':
          if (currentPage === 'users') {
            refreshUserList();
          }
          break;
        case 'message_update':
          if (currentPage === 'messages') {
            refreshMessageLog();
          }
          break;
        case 'log_update':
          if (currentPage === 'logs') {
            refreshLogs();
          }
          break;
        }
      } catch (error) {
        logger.error({ err: error, rawData: data }, 'Error handling WebSocket message');
      }
    }
  
  /**
   * Start refresh interval for metrics
   */
  function startRefreshInterval() {
    // Clear existing interval
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    
    // Get refresh interval from settings (default 5 seconds)
    const interval = 5000;
    
    // Set new interval
    refreshInterval = setInterval(function() {
      // Refresh current page data
      refreshPageData();
    }, interval);
  }
  
  /**
   * Refresh current page data
   */
  function refreshPageData() {
    switch (currentPage) {
      case 'dashboard':
        fetchMetrics();
        break;
      case 'users':
        refreshUserList();
        break;
      case 'messages':
        refreshMessageLog();
        break;
      case 'logs':
        refreshLogs();
        break;
    }
  }
  
  /**
   * Load a page
   * @param {string} page - Page name
   */
  function loadPage(page) {
    // Update current page
    currentPage = page;
    
    // Update page title
    pageTitle.textContent = getPageTitle(page);
    
    // Update active menu item
    sidebarMenuItems.forEach(item => {
      if (item.getAttribute('data-page') === page) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // Show loading indicator
    pageContent.innerHTML = \`
      <div class="loader-container">
        <div class="loader"></div>
        <p>Loading \${getPageTitle(page)}...</p>
      </div>
    \`;
    
    // Check if page content is cached
    if (pageCache[page]) {
      pageContent.innerHTML = pageCache[page];
      initPageHandlers(page);
      refreshPageData();
      return;
    }
    
    // Fetch page content
    fetch(\`/admin/api/pages/\${page}\`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load page');
        }
        return response.text();
      })
      .then(html => {
        // Cache page content
        pageCache[page] = html;
        
        // Update page content
        pageContent.innerHTML = html;
        
        // Initialize page-specific handlers
        initPageHandlers(page);
        
        // Refresh page data
        refreshPageData();
      })
      .catch(error => {
        logger.error({ err: error, page }, 'Error loading page content');
        pageContent.innerHTML = \`
          <div class="alert alert-danger">
            <strong>Error:</strong> Failed to load page. Please try again.
          </div>
        \`;
      });
  }
  
  /**
   * Get page title
   * @param {string} page - Page name
   * @returns {string} Page title
   */
  function getPageTitle(page) {
    switch (page) {
      case 'dashboard':
        return 'Dashboard';
      case 'users':
        return 'User Management';
      case 'channels':
        return 'Channels';
      case 'messages':
        return 'Message Monitoring';
      case 'logs':
        return 'System Logs';
      case 'settings':
        return 'Settings';
      default:
        return 'Dashboard';
    }
  }
  
  /**
   * Initialize page-specific handlers
   * @param {string} page - Page name
   */
  function initPageHandlers(page) {
    switch (page) {
      case 'dashboard':
        initDashboardPage();
        break;
      case 'users':
        initUsersPage();
        break;
      case 'channels':
        initChannelsPage();
        break;
      case 'messages':
        initMessagesPage();
        break;
      case 'logs':
        initLogsPage();
        break;
      case 'settings':
        initSettingsPage();
        break;
    }
  }
  
  /**
   * Initialize dashboard page
   */
  function initDashboardPage() {
    const refreshBtn = document.getElementById('refreshStatusBtn');
    
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        fetchMetrics();
      });
    }
    
    // Fetch initial metrics
    fetchMetrics();
  }
  
  /**
   * Fetch server metrics
   */
  function fetchMetrics() {
    fetch('/admin/api/metrics')
      .then(response => response.json())
      .then(data => {
        updateMetrics(data);
      })
      .catch(error => {
        logger.error({ err: error }, 'Error fetching dashboard metrics');
      });
  }
  
  /**
   * Update metrics display
   * @param {object} data - Metrics data
   */
  function updateMetrics(data) {
    // Update stat cards
    updateStatCard('activeConnections', data.activeConnections || 0);
    updateStatCard('messagesCount', data.messagesCount || 0);
    updateStatCard('memoryUsage', formatBytes(data.memoryUsage?.heapUsed || 0));
    updateStatCard('uptime', formatUptime(data.uptime || 0));
    
    // Update charts if chart.js is available
    if (typeof Chart !== 'undefined') {
      updateConnectionsChart(data.connectionHistory || []);
      updateMessagesChart(data.messageHistory || []);
    }
  }
  
  /**
   * Update a stat card
   * @param {string} id - Card ID
   * @param {any} value - Card value
   */
  function updateStatCard(id, value) {
    const card = document.getElementById(id);
    if (card) {
      card.textContent = value;
    }
  }
  
  /**
   * Format bytes to human-readable size
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Format uptime to human-readable duration
   * @param {number} seconds - Uptime in seconds
   * @returns {string} Formatted uptime
   */
  function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    let result = '';
    if (days > 0) result += days + 'd ';
    if (hours > 0 || days > 0) result += hours + 'h ';
    result += minutes + 'm';
    
    return result;
  }
  
  /**
   * Open a modal dialog
   * @param {string} title - Modal title
   * @param {string} body - Modal body HTML
   * @param {object[]} buttons - Array of button configurations
   */
  function openModal(title, body, buttons = []) {
    // Set modal title
    modalTitle.textContent = title;
    
    // Set modal body
    modalBody.innerHTML = body;
    
    // Clear existing buttons
    modalFooter.innerHTML = '';
    
    // Add buttons
    buttons.forEach(button => {
      const btn = document.createElement('button');
      btn.textContent = button.text;
      btn.className = button.class || 'btn btn-primary';
      
      if (button.click) {
        btn.addEventListener('click', button.click);
      }
      
      modalFooter.appendChild(btn);
    });
    
    // Show modal
    modalContainer.style.display = 'flex';
  }
  
  /**
   * Close the modal dialog
   */
  function closeModal() {
    modalContainer.style.display = 'none';
  }
  
  // Initialize dashboard when DOM is loaded
});`
};

// Export functions and constants
module.exports = {
  serveAssets,
  CSS_FILES,
  JS_FILES
};