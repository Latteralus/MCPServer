// dashboard-core.js - Core functionality for admin dashboard
let currentPage = 'dashboard';
let websocket = null;
let refreshInterval = null;
let pageCache = {};

// DOM elements
let pageTitle;
let pageContent;
let connectionStatus;
let modalContainer;
let modalTitle;
let modalBody;
let modalFooter;

/**
 * Initialize the dashboard
 */
function initDashboard() {
  // Get DOM elements
  pageTitle = document.querySelector('.page-title');
  pageContent = document.getElementById('pageContent');
  connectionStatus = document.getElementById('connectionStatus');
  modalContainer = document.getElementById('modalContainer');
  modalTitle = document.getElementById('modalTitle');
  modalBody = document.getElementById('modalBody');
  modalFooter = document.getElementById('modalFooter');
  
  // Set up menu click handlers
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    if (item.id !== 'logoutBtn') {
      item.addEventListener('click', function(e) {
        e.preventDefault();
        const page = this.getAttribute('data-page');
        if (page !== currentPage) {
          loadPage(page);
        }
      });
    }
  });
  
  // Set up logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      window.location.href = '/admin/logout';
    });
  }
  
  // Set up modal close button
  const modalClose = document.querySelector('.modal-close');
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
  const wsUrl = `${protocol}//${window.location.host}/admin/ws`;
  
  // Create WebSocket connection
  websocket = new WebSocket(wsUrl);
  
  // Connection opened
  websocket.addEventListener('open', function() {
    updateConnectionStatus(true);
    console.log('WebSocket connected');
  });
  
  // Connection closed
  websocket.addEventListener('close', function() {
    updateConnectionStatus(false);
    console.log('WebSocket disconnected');
    
    // Try to reconnect after delay
    setTimeout(connectWebSocket, 5000);
  });
  
  // Connection error
  websocket.addEventListener('error', function(error) {
    updateConnectionStatus(false);
    console.error('WebSocket error:', error);
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
      case 'channel_update':
        if (currentPage === 'channels') {
          refreshChannelList();
        } else if (currentPage === 'dashboard') {
          refreshChannelList();
        }
        break;
    }
  } catch (error) {
    console.error('Error handling WebSocket message:', error);
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
    case 'channels':
      refreshChannelList();
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
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    if (item.getAttribute('data-page') === page) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // Show loading indicator
  pageContent.innerHTML = `
    <div class="loader-container">
      <div class="loader"></div>
      <p>Loading ${getPageTitle(page).toLowerCase()}...</p>
    </div>
  `;
  
  // Check if page content is cached
  if (pageCache[page]) {
    pageContent.innerHTML = pageCache[page];
    initPageHandlers(page);
    refreshPageData();
    return;
  }
  
  // Fetch page content
  fetch(`/admin/api/pages/${page}`)
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
      console.error('Error loading page:', error);
      pageContent.innerHTML = `
        <div class="card">
          <div class="card-body">
            <div class="empty-state">
              <h3>Error Loading Page</h3>
              <p>Failed to load the ${getPageTitle(page)} page. Please try again.</p>
              <button class="btn-primary" onclick="loadPage('${page}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <polyline points="23 20 23 14 17 14"></polyline>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                </svg>
                Retry
              </button>
            </div>
          </div>
        </div>
      `;
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
      return 'Channel Management';
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
  }
}

/**
 * Initialize dashboard page
 */
function initDashboardPage() {
  const refreshStatusBtn = document.getElementById('refreshStatusBtn');
  
  if (refreshStatusBtn) {
    refreshStatusBtn.addEventListener('click', function() {
      fetchMetrics();
      refreshChannelList();
      refreshActivityLog();
    });
  }
  
  // Fetch initial data
  fetchMetrics();
  refreshChannelList();
  refreshActivityLog();
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
      console.error('Error fetching metrics:', error);
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
 * Open a modal dialog
 */
function openModal() {
  if (modalContainer) {
    modalContainer.style.display = 'flex';
  }
}

/**
 * Close the modal dialog
 */
function closeModal() {
  if (modalContainer) {
    modalContainer.style.display = 'none';
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
 * Format a timestamp as a relative time string
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Relative time
 */
function formatTimeAgo(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (isNaN(seconds)) {
    return 'Invalid date';
  }
  
  if (seconds < 60) {
    return 'Just now';
  }
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  }
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }
  
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
  
  // Fall back to date string for older dates
  return date.toLocaleDateString();
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Export functions that will be used by other modules
window.dashboard = {
  // Core functions
  initDashboard,
  loadPage,
  openModal,
  closeModal,
  refreshChannelList,
  refreshActivityLog,
  refreshUserList,
  refreshMessageLog,
  refreshLogs,
  
  // Utility functions
  formatTimeAgo,
  formatBytes,
  formatUptime,
  escapeHtml,
  
  // Initialization functions
  initDashboardPage,
  initUsersPage,
  initChannelsPage,
  initMessagesPage,
  initLogsPage
};

// Initialize the dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard);