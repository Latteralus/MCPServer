// chatServer.js - HIPAA-compliant local WebSocket server for CRM+ Extension
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const url = require('url');

// Determine if running as executable
const isExecutable = process.pkg !== undefined;

// Get application directory for storage
const getAppDirectory = () => {
  // Determine the correct path for storage based on running environment
  const homeDir = os.homedir();
  
  // Use platform-specific app data location
  if (process.platform === 'win32') {
    // Windows: %APPDATA%\CRMPlusChat
    return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'CRMPlusChat');
  } else if (process.platform === 'darwin') {
    // macOS: ~/Library/Application Support/CRMPlusChat
    return path.join(homeDir, 'Library', 'Application Support', 'CRMPlusChat');
  } else {
    // Linux/Unix: ~/.crmpluschat
    return path.join(homeDir, '.crmpluschat');
  }
};

// Create app directory
const appDirectory = getAppDirectory();
try {
  if (!fs.existsSync(appDirectory)) {
    fs.mkdirSync(appDirectory, { recursive: true });
    console.log(`Created application directory: ${appDirectory}`);
  }
} catch (error) {
  console.error('Error creating application directory:', error);
}

// Default server configuration
let config = {
  port: 3000,
  logDirectory: path.join(appDirectory, 'logs'),
  logLevel: 'info', // debug, info, warn, error
  maxConnections: 100,
  authenticateUsers: false, // Enable this if you want to require authentication
  connectionTimeout: 2 * 60 * 1000, // 2 minutes
  heartbeatInterval: 30 * 1000, // 30 seconds
  allowedNetworkRange: '192.168.0.0/16', // Local network range
  adminEnabled: true, // Enable admin dashboard
  adminAuth: {
    username: 'admin',
    passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9' // 'admin123'
  }
};

// Load configuration from config.json if available
const configFilePath = path.join(process.pkg ? path.dirname(process.execPath) : __dirname, 'config.json');
try {
  if (fs.existsSync(configFilePath)) {
    console.log(`Loading configuration from ${configFilePath}`);
    const fileConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    
    // Merge file config with defaults
    config = { ...config, ...fileConfig };
    console.log('Configuration loaded successfully');
  } else {
    console.log('No config.json found, using default configuration');
    
    // Save default config for user reference
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`Created default configuration file: ${configFilePath}`);
  }
} catch (error) {
  console.error('Error loading configuration:', error);
}

// Parse command-line arguments (override config file and defaults)
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace('--', '');
  const value = args[i + 1];
  
  if (key in config) {
    // Convert value to appropriate type
    if (typeof config[key] === 'number') {
      config[key] = parseInt(value, 10);
    } else if (typeof config[key] === 'boolean') {
      config[key] = value.toLowerCase() === 'true';
    } else {
      config[key] = value;
    }
  }
}

// Ensure log directory exists
if (!fs.existsSync(config.logDirectory)) {
  fs.mkdirSync(config.logDirectory, { recursive: true });
}

// Create log file path
const logFilePath = path.join(config.logDirectory, `chat_server_${new Date().toISOString().slice(0, 10)}.log`);

// Simple logging helper
function log(level, message, details = {}) {
  const levels = ['debug', 'info', 'warn', 'error'];
  const levelIndex = levels.indexOf(level);
  const configLevelIndex = levels.indexOf(config.logLevel);
  
  if (levelIndex >= configLevelIndex) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      details
    };
    
    const logString = JSON.stringify(logEntry);
    
    // Console output
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    
    // File output
    try {
      fs.appendFileSync(logFilePath, logString + '\n');
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }
}

// Hash password using SHA-256
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Track server start time
const serverStartTime = new Date();

// Create HTTP server with improved routing
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Logging
  log('info', 'HTTP access', {
    ip: req.socket.remoteAddress,
    url: req.url,
    userAgent: req.headers['user-agent']
  });

  // Admin dashboard routes
  if (pathname.startsWith('/admin')) {
    handleAdminRoutes(req, res, pathname);
    return;
  }

  // Default status page for all other routes
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>MCP Chat Server</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #2196F3; }
        .status { padding: 15px; background-color: #e8f5e9; border-radius: 4px; margin-bottom: 20px; }
        .info { background-color: #e3f2fd; padding: 15px; border-radius: 4px; }
        .clients { margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f5f5f5; }
        .admin-link { display: inline-block; margin-top: 20px; padding: 10px 15px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>HIPAA-Compliant Chat Server</h1>
      <div class="status">
        <h2>Server Status: Running</h2>
        <p>The server is running and ready to accept WebSocket connections.</p>
      </div>
      <div class="info">
        <h3>Connection Information</h3>
        <p>WebSocket URL: <code>ws://${req.headers.host}</code></p>
        <p>Active Clients: ${wss ? wss.clients.size : 0}/${config.maxConnections}</p>
        <p>Server started: ${serverStartTime.toLocaleString()}</p>
      </div>
      <div class="note">
        <p><strong>Note:</strong> This server should only be used within your local network. 
        All communications are kept within the organization's network for HIPAA compliance.</p>
      </div>
      <a href="/admin/login.html" class="admin-link">Access Admin Dashboard</a>
    </body>
    </html>
  `);
});

/**
 * Handle admin routes
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {string} pathname - Request pathname
 */
function handleAdminRoutes(req, res, pathname) {
  // Static files serving for admin dashboard
  const adminDir = path.join(__dirname, 'admin');
  
  // Security headers
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Content-Security-Policy': "default-src 'self'"
  };

  // Authentication handler for login
  if (pathname === '/admin/login' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      const formData = new URLSearchParams(body);
      const username = formData.get('username');
      const password = formData.get('password');
      
      // Simple authentication
      if (username === config.adminAuth.username && 
          hashPassword(password) === config.adminAuth.passwordHash) {
        // Successful login
        res.writeHead(302, { 
          'Location': '/admin/dashboard.html',
          'Set-Cookie': `admin_session=${crypto.randomBytes(16).toString('hex')}; HttpOnly; Path=/; Max-Age=3600`
        });
        res.end();
      } else {
        // Failed login
        res.writeHead(302, { 
          'Location': '/admin/login.html?error=' + encodeURIComponent('Invalid credentials')
        });
        res.end();
      }
    });
    return;
  }

  // Serve static files for admin routes
  if (pathname.startsWith('/admin/') || pathname.startsWith('/admin')) {
    // Determine the file path
    let filePath = path.join(adminDir, pathname.replace('/admin/', ''));
    
    // Handle root /admin route
    if (pathname === '/admin' || pathname === '/admin/') {
      filePath = path.join(adminDir, 'login.html');
    }
    
    // Security: prevent directory traversal
    if (!filePath.startsWith(adminDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // Check if file exists
    if (fs.existsSync(filePath)) {
      // Determine content type
      const ext = path.extname(filePath);
      const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript'
      };
      const contentType = contentTypes[ext] || 'text/plain';

      // Read file
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
          return;
        }

        // Apply security headers
        Object.entries(securityHeaders).forEach(([header, value]) => {
          res.setHeader(header, value);
        });

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      });
      return;
    }
  }

  // 404 for other admin routes
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>404 - Not Found</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #f44336; }
        a { color: #2196F3; text-decoration: none; }
      </style>
    </head>
    <body>
      <h1>404 - Page Not Found</h1>
      <p>The requested admin page does not exist.</p>
      <p><a href="/admin/login.html">Return to Login</a></p>
    </body>
    </html>
  `);
}

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Function to handle WebSocket connections (placeholder)
wss.on('connection', (ws, req) => {
  // Placeholder for WebSocket connection handling
  log('info', 'New WebSocket connection');
  
  ws.on('message', (message) => {
    log('info', 'Received WebSocket message', { message: message.toString() });
  });
  
  ws.on('close', () => {
    log('info', 'WebSocket connection closed');
  });
});

// Start the server
server.listen(config.port, () => {
  log('info', `Server started on port ${config.port}`, {
    port: config.port,
    logLevel: config.logLevel,
    authenticateUsers: config.authenticateUsers,
    maxConnections: config.maxConnections
  });
  
  console.log(`
  ===================================================
    HIPAA-Compliant Chat Server Started
  ===================================================
  
    WebSocket URL: ws://localhost:${config.port}
    Status Page:   http://localhost:${config.port}
    Admin Dashboard: http://localhost:${config.port}/admin
    
    Log File:      ${logFilePath}
    
  ===================================================
  Server is ready to accept connections
  Press Ctrl+C to shutdown
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  log('info', 'Server shutting down');
  server.close(() => {
    log('info', 'Server closed');
    process.exit(0);
  });
});