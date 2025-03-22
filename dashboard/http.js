// server/dashboard/http.js - HTTP routes for admin dashboard
const fs = require('fs');
const path = require('path');
const url = require('url');
const { authenticate, validateSession, endSession } = require('./auth');
const { getConfig, setConfig, updatePassword } = require('./config');
const { logAction, getAdminLogs, getLogDates, exportLogs } = require('./audit');
const { serveAssets } = require('./assets');

/**
 * Setup HTTP routes for admin dashboard
 * @param {object} server - HTTP server instance
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 * @param {object} serverConfig - Server configuration
 */
function setupHttpRoutes(server, wss, clients, serverConfig) {
  // Store the original request handler
  const originalRequestHandler = server.listeners('request')[0];
  
  // Remove existing handler
  server.removeAllListeners('request');
  
  // Add new request handler that intercepts admin routes
  server.on('request', (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // Only handle admin routes
    if (pathname.startsWith('/admin')) {
      handleAdminRequest(req, res, parsedUrl, wss, clients, serverConfig);
    } else {
      // Not an admin route, pass to original handler
      originalRequestHandler(req, res);
    }
  });
}

/**
 * Handle admin dashboard requests
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {object} parsedUrl - Parsed URL
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 * @param {object} serverConfig - Server configuration
 */
function handleAdminRequest(req, res, parsedUrl, wss, clients, serverConfig) {
  const pathname = parsedUrl.pathname;
  
  // Security headers for all admin responses
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
  };
  
  // Apply security headers to all responses
  Object.entries(securityHeaders).forEach(([header, value]) => {
    res.setHeader(header, value);
  });
  
  // Handle login page
  if (pathname === '/admin/login') {
    handleLoginPage(req, res, parsedUrl.query);
    return;
  }
  
  // Handle admin dashboard assets
  if (pathname.startsWith('/admin/assets/')) {
    serveAssets(req, res, pathname);
    return;
  }
  
  // Handle API endpoints
  if (pathname.startsWith('/admin/api/')) {
    handleApiRequest(req, res, parsedUrl, wss, clients, serverConfig);
    return;
  }
  
  // Handle main dashboard page
  if (pathname === '/admin' || pathname === '/admin/') {
    handleDashboardPage(req, res);
    return;
  }
  
  // Handle logout
  if (pathname === '/admin/logout') {
    handleLogout(req, res);
    return;
  }
  
  // 404 for other admin routes
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Not Found</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #f44336; }
        a { color: #2196F3; text-decoration: none; }
      </style>
    </head>
    <body>
      <h1>404 - Not Found</h1>
      <p>The page you requested does not exist.</p>
      <p><a href="/admin">Return to Dashboard</a></p>
    </body>
    </html>
  `);
}

/**
 * Handle login page requests
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {object} query - Query parameters
 */
function handleLoginPage(req, res, query) {
  if (req.method === 'GET') {
    // Serve login page
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>HIPAA Chat - Admin Login</title>
        <link rel="stylesheet" href="/admin/assets/login.css">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body>
        <div class="login-container">
          <h1>Admin Login</h1>
          <form method="post" action="/admin/login">
            <div class="form-group">
              <label for="username">Username</label>
              <input type="text" id="username" name="username" required>
            </div>
            <div class="form-group">
              <label for="password">Password</label>
              <input type="password" id="password" name="password" required>
            </div>
            <button type="submit" class="submit-btn">Login</button>
            <div id="error-message" class="error" style="display: none;"></div>
          </form>
        </div>
        <script>
          // Show error message if present in URL
          const urlParams = new URLSearchParams(window.location.search);
          const error = urlParams.get('error');
          if (error) {
            const errorElement = document.getElementById('error-message');
            errorElement.textContent = decodeURIComponent(error);
            errorElement.style.display = 'block';
          }
        </script>
      </body>
      </html>
    `);
  } else if (req.method === 'POST') {
    // Handle login
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      const formData = new URLSearchParams(body);
      const username = formData.get('username');
      const password = formData.get('password');
      const ip = req.socket.remoteAddress;
      
      // Authenticate credentials
      const sessionId = authenticate(username, password, ip);
      
      if (sessionId) {
        // Set session cookie and redirect to dashboard
        res.writeHead(302, {
          'Location': '/admin',
          'Set-Cookie': `admin_session=${sessionId}; HttpOnly; Path=/; Max-Age=${getConfig('auth.sessionDuration', 3600)}`
        });
        res.end();
      } else {
        // Failed login
        res.writeHead(302, {
          'Location': '/admin/login?error=' + encodeURIComponent('Invalid username or password')
        });
        res.end();
      }
    });
  } else {
    // Method not allowed
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
  }
}

/**
 * Handle main dashboard page
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 */
function handleDashboardPage(req, res) {
  // Extract session ID from cookies
  const cookies = parseCookies(req);
  const sessionId = cookies.admin_session;
  
  // Validate session
  const session = validateSession(sessionId, req.socket.remoteAddress);
  
  if (!session) {
    // Redirect to login if session is invalid
    res.writeHead(302, { 'Location': '/admin/login' });
    res.end();
    return;
  }
  
  // Serve dashboard HTML
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>HIPAA Chat - Admin Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="/admin/assets/dashboard.css">
    </head>
    <body>
      <div class="container">
        <div class="sidebar">
          <div class="sidebar-header">
            <h1>HIPAA Chat Admin</h1>
          </div>
          <ul class="sidebar-menu">
            <li class="active" data-page="dashboard">
              <i class="icon">📊</i>Dashboard
            </li>
            <li data-page="users">
              <i class="icon">👥</i>User Management
            </li>
            <li data-page="channels">
              <i class="icon">💬</i>Channels
            </li>
            <li data-page="messages">
              <i class="icon">✉️</i>Message Monitoring
            </li>
            <li data-page="logs">
              <i class="icon">📝</i>System Logs
            </li>
            <li data-page="settings">
              <i class="icon">⚙️</i>Settings
            </li>
            <li id="logoutBtn">
              <i class="icon">🚪</i>Logout
            </li>
          </ul>
          <div id="connectionStatus">
            <span class="status-indicator online">• Connected</span>
          </div>
        </div>
        <div class="main-content">
          <div class="header">
            <h1 class="page-title">Dashboard</h1>
            <div class="user-info">
              <span>Welcome, ${session.username}</span>
            </div>
          </div>
          
          <div id="pageContent">
            <!-- Page content will be loaded here -->
            <div class="loader-container">
              <div class="loader"></div>
              <p>Loading dashboard...</p>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Modal container -->
      <div id="modalContainer" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="modalTitle">Modal Title</h2>
            <span class="close">&times;</span>
          </div>
          <div class="modal-body" id="modalBody">
            <!-- Modal content will be loaded here -->
          </div>
          <div class="modal-footer" id="modalFooter">
            <!-- Modal buttons will be added here -->
          </div>
        </div>
      </div>
      
      <script src="/admin/assets/dashboard.js"></script>
    </body>
    </html>
  `);
  
  // Log dashboard access
  logAction(session.username, 'dashboard_access', { ip: req.socket.remoteAddress });
}

/**
 * Handle logout request
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 */
function handleLogout(req, res) {
  // Get session ID from cookies
  const cookies = parseCookies(req);
  const sessionId = cookies.admin_session;
  
  // End session if it exists
  if (sessionId) {
    endSession(sessionId);
  }
  
  // Clear cookie and redirect to login
  res.writeHead(302, {
    'Location': '/admin/login',
    'Set-Cookie': 'admin_session=; HttpOnly; Path=/; Max-Age=0'
  });
  res.end();
}

/**
 * Handle API requests
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {object} parsedUrl - Parsed URL
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 * @param {object} serverConfig - Server configuration
 */
function handleApiRequest(req, res, parsedUrl, wss, clients, serverConfig) {
  // Get session ID from cookies
  const cookies = parseCookies(req);
  const sessionId = cookies.admin_session;
  
  // Validate session
  const session = validateSession(sessionId, req.socket.remoteAddress);
  
  if (!session) {
    // Unauthorized
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  
  // Extract API endpoint from path
  const pathname = parsedUrl.pathname;
  const endpoint = pathname.replace('/admin/api/', '');
  
  // Handle different API endpoints
  switch (endpoint) {
    case 'ping':
      handlePingApi(req, res);
      break;
    case 'metrics':
      handleMetricsApi(req, res, wss, clients);
      break;
    case 'users':
      handleUsersApi(req, res, clients);
      break;
    case 'messages':
      handleMessagesApi(req, res, clients);
      break;
    case 'channels':
      handleChannelsApi(req, res, clients);
      break;
    case 'logs':
      handleLogsApi(req, res, parsedUrl.query);
      break;
    case 'settings':
      handleSettingsApi(req, res, serverConfig);
      break;
    default:
      // Unknown API endpoint
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API endpoint not found' }));
  }
}

/**
 * Simple ping API to check if server is alive
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 */
function handlePingApi(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString()
  }));
}

/**
 * Handle metrics API
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 */
function handleMetricsApi(req, res, wss, clients) {
  // This is a placeholder - we'll implement the actual metrics API 
  // in the metrics module later
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    activeConnections: wss.clients.size,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  }));
}

/**
 * Handle users API
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {Map} clients - Client map
 */
function handleUsersApi(req, res, clients) {
  // This is a placeholder - we'll implement the actual users API later
  const activeUsers = [];
  
  clients.forEach((client, ws) => {
    if (client.authenticated) {
      activeUsers.push({
        id: client.id,
        username: client.username,
        ip: client.ip,
        connectionTime: client.connectionTime,
        lastActivity: client.lastActivity
      });
    }
  });
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ users: activeUsers }));
}

/**
 * Handle messages API
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {Map} clients - Client map
 */
function handleMessagesApi(req, res, clients) {
  // This is a placeholder - we'll implement the actual messages API later
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ messages: [] }));
}

/**
 * Handle channels API
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {Map} clients - Client map
 */
function handleChannelsApi(req, res, clients) {
  // This is a placeholder - we'll implement the actual channels API later
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ channels: [] }));
}

/**
 * Handle logs API
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {object} query - Query parameters
 */
function handleLogsApi(req, res, query) {
  // Get logs using parameters from query
  const logs = getAdminLogs({
    date: query.date,
    username: query.username,
    action: query.action,
    limit: parseInt(query.limit, 10),
    offset: parseInt(query.offset, 10)
  });
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(logs));
}

/**
 * Handle settings API
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {object} serverConfig - Server configuration
 */
function handleSettingsApi(req, res, serverConfig) {
  if (req.method === 'GET') {
    // Return current settings (excluding sensitive data)
    const settings = {
      ui: getConfig('ui'),
      features: getConfig('features'),
      security: {
        allowRemoteAccess: getConfig('security.allowRemoteAccess'),
        requireHTTPS: getConfig('security.requireHTTPS'),
        sessionIdleTimeout: getConfig('security.sessionIdleTimeout')
      },
      audit: {
        logActions: getConfig('audit.logActions'),
        logAdminActions: getConfig('audit.logAdminActions'),
        logRetentionDays: getConfig('audit.logRetentionDays')
      }
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(settings));
  } else if (req.method === 'POST') {
    // Update settings
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const newSettings = JSON.parse(body);
        
        // Update each setting
        let updated = false;
        
        if (newSettings.ui) {
          Object.entries(newSettings.ui).forEach(([key, value]) => {
            updated = setConfig(`ui.${key}`, value) || updated;
          });
        }
        
        if (newSettings.features) {
          Object.entries(newSettings.features).forEach(([key, value]) => {
            updated = setConfig(`features.${key}`, value) || updated;
          });
        }
        
        if (newSettings.security) {
          Object.entries(newSettings.security).forEach(([key, value]) => {
            updated = setConfig(`security.${key}`, value) || updated;
          });
        }
        
        if (newSettings.audit) {
          Object.entries(newSettings.audit).forEach(([key, value]) => {
            updated = setConfig(`audit.${key}`, value) || updated;
          });
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: updated }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request format' }));
      }
    });
  } else {
    // Method not allowed
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
}

/**
 * Parse cookies from request
 * @param {object} req - HTTP request
 * @returns {object} Parsed cookies
 */
function parseCookies(req) {
  const cookies = {};
  const cookieHeader = req.headers.cookie;
  
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      cookies[name] = value;
    });
  }
  
  return cookies;
}

// Export HTTP functions
module.exports = {
  setupHttpRoutes,
  parseCookies
};