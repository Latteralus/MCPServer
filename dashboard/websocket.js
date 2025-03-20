// server/dashboard/websocket.js - WebSocket handler for admin dashboard
const { validateSession } = require('./auth');
const { getMetrics, recordConnection, recordDisconnection } = require('./metrics');
const { logAction } = require('./audit');

// Active WebSocket connections
const activeConnections = new Map();

/**
 * Setup WebSocket handling for admin dashboard
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 * @param {object} serverConfig - Server configuration
 * @param {function} broadcast - Broadcast function
 */
function setupWebSocket(wss, clients, serverConfig, broadcast) {
  // Add a specific path for admin WebSocket connections
  wss.on('connection', (ws, req) => {
    const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
    
    // Handle admin WebSocket connections
    if (pathname === '/admin/ws') {
      handleAdminConnection(ws, req, wss, clients, serverConfig, broadcast);
    }
    // Let other connections pass through to the regular WebSocket handler
  });
}

/**
 * Handle admin WebSocket connection
 * @param {object} ws - WebSocket connection
 * @param {object} req - HTTP request
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 * @param {object} serverConfig - Server configuration
 * @param {function} broadcast - Broadcast function
 */
function handleAdminConnection(ws, req, wss, clients, serverConfig, broadcast) {
  // Extract session ID from cookies
  const cookies = parseCookies(req);
  const sessionId = cookies.admin_session;
  const ip = req.socket.remoteAddress;
  
  // Validate session
  const session = validateSession(sessionId, ip);
  
  if (!session) {
    // Close connection if session is invalid
    ws.close(4001, 'Unauthorized');
    return;
  }
  
  // Session is valid
  const connectionTime = new Date();
  
  // Add to active connections
  activeConnections.set(ws, {
    session,
    connectionTime,
    lastActivity: connectionTime
  });
  
  // Record connection for metrics
  recordConnection(connectionTime);
  
  // Log connection
  logAction(session.username, 'websocket_connect', { ip });
  
  // Send initial data
  sendInitialData(ws, wss, clients);
  
  // Handle messages
  ws.on('message', (message) => {
    handleAdminMessage(ws, message, wss, clients, serverConfig, broadcast);
  });
  
  // Handle connection close
  ws.on('close', () => {
    handleAdminDisconnect(ws, wss, clients);
  });
  
  // Handle connection error
  ws.on('error', (error) => {
    console.error('Admin WebSocket error:', error);
  });
}

/**
 * Send initial data to the admin client
 * @param {object} ws - WebSocket connection
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 */
function sendInitialData(ws, wss, clients) {
  // Send metrics
  sendJson(ws, {
    type: 'metrics',
    data: getMetrics(wss, clients)
  });
  
  // Send client list
  const clientList = [];
  clients.forEach((client, clientWs) => {
    if (client.authenticated) {
      clientList.push({
        id: client.id,
        username: client.username,
        ip: client.ip,
        connectionTime: client.connectionTime,
        lastActivity: client.lastActivity
      });
    }
  });
  
  sendJson(ws, {
    type: 'clients',
    data: clientList
  });
}

/**
 * Handle admin WebSocket message
 * @param {object} ws - WebSocket connection
 * @param {string} message - Message data
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 * @param {object} serverConfig - Server configuration
 * @param {function} broadcast - Broadcast function
 */
function handleAdminMessage(ws, message, wss, clients, serverConfig, broadcast) {
  // Get connection data
  const connection = activeConnections.get(ws);
  if (!connection) return;
  
  // Update last activity
  connection.lastActivity = new Date();
  activeConnections.set(ws, connection);
  
  try {
    const data = JSON.parse(message);
    const session = connection.session;
    
    // Process command
    switch (data.command) {
      case 'ping':
        // Respond to ping
        sendJson(ws, { type: 'pong', timestamp: new Date().toISOString() });
        break;
        
      case 'get_metrics':
        // Send metrics
        sendJson(ws, {
          type: 'metrics',
          data: getMetrics(wss, clients)
        });
        break;
        
      case 'disconnect_client':
        // Disconnect a client
        handleDisconnectClient(ws, data, wss, clients, session);
        break;
        
      case 'send_message':
        // Send a message to a client
        handleSendMessage(ws, data, wss, clients, broadcast, session);
        break;
        
      default:
        // Unknown command
        sendJson(ws, {
          type: 'error',
          error: 'Unknown command',
          command: data.command
        });
    }
  } catch (error) {
    console.error('Error processing admin message:', error);
    
    // Send error response
    sendJson(ws, {
      type: 'error',
      error: 'Invalid message format'
    });
  }
}

/**
 * Handle disconnect client command
 * @param {object} ws - WebSocket connection
 * @param {object} data - Command data
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 * @param {object} session - Admin session
 */
function handleDisconnectClient(ws, data, wss, clients, session) {
  const clientId = data.clientId;
  if (!clientId) {
    sendJson(ws, {
      type: 'error',
      error: 'Client ID is required'
    });
    return;
  }
  
  // Find client with matching ID
  let targetClient = null;
  let targetWs = null;
  
  clients.forEach((client, clientWs) => {
    if (client.id === clientId) {
      targetClient = client;
      targetWs = clientWs;
    }
  });
  
  if (!targetClient || !targetWs) {
    sendJson(ws, {
      type: 'error',
      error: 'Client not found'
    });
    return;
  }
  
  // Log the disconnect action
  logAction(session.username, 'admin_disconnect_client', {
    clientId,
    username: targetClient.username,
    reason: data.reason || 'Administrator initiated disconnect'
  });
  
  // Close the client connection
  targetWs.close(1000, data.reason || 'Administrator initiated disconnect');
  
  // Send success response
  sendJson(ws, {
    type: 'success',
    message: 'Client disconnected',
    clientId
  });
  
  // Broadcast updated client list
  broadcastClientList(wss, clients);
}

/**
 * Handle send message command
 * @param {object} ws - WebSocket connection
 * @param {object} data - Command data
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 * @param {function} broadcast - Broadcast function
 * @param {object} session - Admin session
 */
function handleSendMessage(ws, data, wss, clients, broadcast, session) {
  const { recipients, message, type } = data;
  
  if (!message) {
    sendJson(ws, {
      type: 'error',
      error: 'Message is required'
    });
    return;
  }
  
  // Create admin message
  const adminMessage = {
    type: type || 'admin_message',
    sender: 'SYSTEM',
    text: message,
    timestamp: new Date().toISOString(),
    id: generateId(),
    isAdmin: true
  };
  
  // Determine recipients
  if (recipients === 'all') {
    // Broadcast to all clients
    broadcast(adminMessage);
    
    // Log the broadcast action
    logAction(session.username, 'admin_broadcast', {
      messageId: adminMessage.id,
      messageType: adminMessage.type,
      recipients: 'all'
    });
  } else if (Array.isArray(recipients)) {
    // Send to specific clients
    let sentCount = 0;
    
    recipients.forEach(clientId => {
      // Find client with matching ID
      clients.forEach((client, clientWs) => {
        if (client.id === clientId && client.authenticated && clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify(adminMessage));
          sentCount++;
        }
      });
    });
    
    // Log the targeted message action
    logAction(session.username, 'admin_message', {
      messageId: adminMessage.id,
      messageType: adminMessage.type,
      recipients,
      sentCount
    });
  } else {
    sendJson(ws, {
      type: 'error',
      error: 'Invalid recipients format'
    });
    return;
  }
  
  // Send success response
  sendJson(ws, {
    type: 'success',
    message: 'Message sent',
    adminMessage
  });
}

/**
 * Handle admin client disconnection
 * @param {object} ws - WebSocket connection
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 */
function handleAdminDisconnect(ws, wss, clients) {
  // Get connection data
  const connection = activeConnections.get(ws);
  if (connection) {
    const { session, connectionTime } = connection;
    
    // Log disconnection
    logAction(session.username, 'websocket_disconnect', {
      duration: (new Date() - connectionTime) / 1000
    });
    
    // Record disconnection for metrics
    recordDisconnection(connectionTime);
  }
  
  // Remove from active connections
  activeConnections.delete(ws);
}

/**
 * Broadcast updated client list to all admin connections
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 */
function broadcastClientList(wss, clients) {
  const clientList = [];
  
  clients.forEach((client, clientWs) => {
    if (client.authenticated) {
      clientList.push({
        id: client.id,
        username: client.username,
        ip: client.ip,
        connectionTime: client.connectionTime,
        lastActivity: client.lastActivity
      });
    }
  });
  
  // Send to all admin connections
  const message = {
    type: 'clients',
    data: clientList
  };
  
  activeConnections.forEach((connection, ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

/**
 * Generate a random ID
 * @returns {string} Random ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Send JSON data to a WebSocket
 * @param {object} ws - WebSocket connection
 * @param {object} data - Data to send
 */
function sendJson(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
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

// Export WebSocket functions
module.exports = {
  setupWebSocket,
  broadcastClientList,
  activeConnections
};