const UserModel = require('../models/userModel');
const MessageModel = require('../models/messageModel');
const ChannelModel = require('../models/channelModel');
const AuthService = require('../services/authService');
const PermissionService = require('../services/permissionService');
const NotificationService = require('../services/notificationService');
const AuditModel = require('../models/auditModel');
const config = require('../config');
const ResourceAuthorizationService = require('../services/resourceAuthorizationService');
const logger = require('../config/logger');

class WebSocketHandlers {
  /**
   * Authenticate WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} req - HTTP request
   * @returns {Promise<Object|null>} Authenticated user or null
   */
  static async authenticate(ws, req) {
    try {
      const authMessage = await this.waitForAuthMessage(ws);
      if (!authMessage || !authMessage.token) {
        logger.warn('Authentication failed: No valid auth message received');
        ws.send(JSON.stringify({
          type: 'authentication_response',
          success: false,
          reason: 'No authentication credentials provided'
        }));
        return null;
      }
      if (
        process.env.NODE_ENV === 'development' &&
        process.env.DEV_AUTH_TOKEN &&
        authMessage.token === process.env.DEV_AUTH_TOKEN
      ) {
        const user = {
          id: 'dev',
          username: 'Developer',
          permissions: ['dev.*']
        };
        ws.send(JSON.stringify({
          type: 'authentication_response',
          success: true,
          user: { id: user.id, username: user.username }
        }));
       logger.info('Developer authentication bypass using DEV_AUTH_TOKEN');
       await AuditModel.log({
         userId: user.id,
          action: 'websocket_connect',
          details: { bypass: 'development auth bypass', remoteAddress: req.socket.remoteAddress }
        });
        return user;
      }
      const user = await AuthService.validateSessionToken(authMessage.token);
      if (!user) {
        logger.warn('Authentication failed: Invalid token');
        ws.send(JSON.stringify({
          type: 'authentication_response',
          success: false,
          reason: 'Invalid or expired token'
        }));
        return null;
      }
      ws.send(JSON.stringify({
        type: 'authentication_response',
        success: true,
        user: { id: user.id, username: user.username }
      }));
     logger.info(`User authenticated: ${user.username}`);
     await AuditModel.log({
       userId: user.id,
        action: 'websocket_connect',
        details: { remoteAddress: req.socket.remoteAddress }
      });
      return user;
    } catch (error) {
      logger.error({ err: error }, 'WebSocket authentication error');
      ws.send(JSON.stringify({
        type: 'authentication_response',
        success: false,
        reason: 'Authentication error'
      }));
      await AuditModel.log({
        action: 'websocket_connect_failed',
        details: { error: error.message, remoteAddress: req.socket.remoteAddress }
      });
      return null;
    }
  }

  /**
   * Wait for authentication message.
   * @param {WebSocket} ws - WebSocket connection
   * @returns {Promise<Object|null>} Authentication message or null if not received
   */
  static waitForAuthMessage(ws) {
    return new Promise((resolve) => {
      const messageHandler = (message) => {
        try {
          let messageStr = typeof message === 'string'
            ? message
            : (Buffer.isBuffer(message) ? message.toString('utf8') : '');
          const parsed = JSON.parse(messageStr);
          if (parsed.type === 'authenticate') {
            ws.removeEventListener('message', messageHandler);
            resolve(parsed);
          }
        } catch (e) {
          logger.error({ err: e }, 'Error parsing authentication message');
        }
      };
      ws.addEventListener('message', messageHandler);
      const closeHandler = () => {
        ws.removeEventListener('message', messageHandler);
        ws.removeEventListener('close', closeHandler);
        resolve(null);
      };
      ws.addEventListener('close', closeHandler);
    });
  }

  /**
   * Handle incoming WebSocket messages.
   * Control messages (ping/heartbeat) are processed immediately for higher priority.
   * Other messages are enqueued using setImmediate.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {string|Buffer} message - Incoming message
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @returns {Promise<void>}
   */
  static async handleMessage(ws, user, message, broadcaster) {
    if (config.debugMode) {
      logger.debug({
        type: typeof message,
        isBuffer: Buffer.isBuffer(message),
        length: Buffer.isBuffer(message) ? message.length : undefined
      }, 'Message received');
    }
    let messageText = typeof message === 'string'
      ? message
      : (Buffer.isBuffer(message) ? message.toString('utf8') : null);
    if (messageText === null) {
      logger.error({ messageType: typeof message }, 'Unknown message format');
      this.sendResponse(ws, {
        type: 'error',
        error: 'Unknown message format',
        timestamp: new Date().toISOString()
      });
      return;
    }
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(messageText);
    } catch (parseError) {
      logger.error({ err: parseError }, 'Failed to parse message');
      this.sendResponse(ws, {
        type: 'error',
        error: 'Invalid message format. Expected JSON.',
        timestamp: new Date().toISOString()
      });
      return;
    }
    if (config.debugMode) {
      logger.debug({ parsedMessage }, 'Parsed message');
    }
    if (!parsedMessage.type) {
      logger.error('Message missing type property');
      this.sendResponse(ws, {
        type: 'error',
        error: 'Message missing type property',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Process control messages (e.g., ping/heartbeat) immediately
    if (parsedMessage.type === 'ping' || parsedMessage.type === 'heartbeat') {
      try {
        await this.processMessage(ws, user, parsedMessage, broadcaster);
      } catch (error) {
        logger.error({ err: error, userId: user.id }, 'Error processing control message');
        await AuditModel.log({
          userId: user.id,
          action: 'websocket_message_error',
          details: { error: error.message }
        });
        this.sendResponse(ws, {
          type: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // Enqueue other messages to avoid blocking the event loop
      setImmediate(async () => {
        try {
          await this.processMessage(ws, user, parsedMessage, broadcaster);
        } catch (error) {
          logger.error({ err: error, userId: user.id }, 'Error processing message');
          await AuditModel.log({
            userId: user.id,
            action: 'websocket_message_error',
            details: { error: error.message }
          });
          this.sendResponse(ws, {
            type: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      });
    }
  }

  // Original methods continue below, still need refactoring

  /**
   * Process the parsed message based on its type.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} parsedMessage - Parsed message object
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   */
  static async processMessage(ws, user, parsedMessage, broadcaster) {
    const responseBase = {
      messageId: parsedMessage.messageId || null,
      timestamp: new Date().toISOString()
    };
    switch (parsedMessage.type) {
      case 'send_message':
      case 'chat_message':
        await this.handleSendMessage(ws, user, parsedMessage, broadcaster, responseBase);
        break;
      case 'join_channel':
      case 'channel_join':
        await this.handleJoinChannel(ws, user, parsedMessage, broadcaster, responseBase);
        break;
      case 'leave_channel':
      case 'channel_leave':
        await this.handleLeaveChannel(ws, user, parsedMessage, broadcaster, responseBase);
        break;
      case 'edit_message':
        await this.handleEditMessage(ws, user, parsedMessage, broadcaster, responseBase);
        break;
      case 'delete_message':
        await this.handleDeleteMessage(ws, user, parsedMessage, broadcaster, responseBase);
        break;
      case 'typing_indicator':
        await this.handleTypingIndicator(ws, user, parsedMessage, broadcaster, responseBase);
        break;
      case 'read_receipt':
        await this.handleReadReceipt(ws, user, parsedMessage, broadcaster, responseBase);
        break;
      case 'ping':
      case 'heartbeat':
        this.sendResponse(ws, {
          ...responseBase,
          type: 'pong',
          timestamp: new Date().toISOString()
        });
        break;
      case 'channel_list_request':
        await this.handleChannelListRequest(ws, user, responseBase);
        break;
      case 'authenticate':
        this.sendResponse(ws, {
          ...responseBase,
          type: 'authentication_response',
          success: true,
          message: 'Already authenticated'
        });
        break;
      default:
        logger.warn({ messageType: parsedMessage.type }, 'Unknown message type received');
        this.sendResponse(ws, {
          ...responseBase,
          type: 'error',
          error: `Unknown message type: ${parsedMessage.type}`,
          supportedTypes: 'send_message, chat_message, join_channel, channel_join, leave_channel, channel_leave, edit_message, delete_message, typing_indicator, read_receipt, ping, heartbeat, channel_list_request',
          timestamp: new Date().toISOString()
        });
    }
  }

  // The remaining handler functions (handleSendMessage, handleJoinChannel, etc.) remain unchanged.
  // They are assumed to be defined elsewhere in the file as per the existing implementation.

  /**
   * Send response to client.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} data - Response data
   */
  static sendResponse(ws, data) {
    if (ws.readyState === ws.OPEN) {
      try {
        const jsonMessage = JSON.stringify(data);
        ws.send(jsonMessage);
      } catch (error) {
        logger.error({ err: error }, 'Error sending response');
      }
    }
  }

  /**
   * Extract authentication token from request.
   * @param {Object} req - HTTP request
   * @returns {string|null} Authentication token
   */
  static extractTokenFromRequest(req) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const tokenFromUrl = parsedUrl.searchParams.get('token');
    if (tokenFromUrl) {
      return tokenFromUrl;
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    const protocol = req.headers['sec-websocket-protocol'];
    if (protocol && protocol.startsWith('token.')) {
      return protocol.slice(6);
    }
    return null;
  }
}

module.exports = WebSocketHandlers;
