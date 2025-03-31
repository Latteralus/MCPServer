// MCPServer/websocket/handlers.js
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
    // ... (authenticate implementation as before) ...
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
          permissions: ['dev.*'] // Grant all permissions in dev mode bypass
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
      // Fetch full user details including permissions after validation
      const fullUser = await UserModel.findById(user.id);
      if (!fullUser) {
          logger.error(`Authenticated user ID ${user.id} not found in database.`);
          ws.send(JSON.stringify({ type: 'authentication_response', success: false, reason: 'User account not found.' }));
          return null;
      }

      ws.send(JSON.stringify({
        type: 'authentication_response',
        success: true,
        user: { id: fullUser.id, username: fullUser.username, role: fullUser.role } // Send role too
      }));
     logger.info(`User authenticated: ${fullUser.username}`);
     await AuditModel.log({
       userId: fullUser.id,
        action: 'websocket_connect',
        details: { remoteAddress: req.socket.remoteAddress }
      });
      return fullUser; // Return the full user object with permissions
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
    // ... (waitForAuthMessage implementation as before) ...
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
   * @param {Object} user - Authenticated user (should include permissions)
   * @param {string|Buffer} message - Incoming message
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @returns {Promise<void>}
   */
  static async handleMessage(ws, user, message, broadcaster) {
    // ... (handleMessage implementation as before) ...
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

  /**
   * Process the parsed message based on its type.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user (should include permissions)
   * @param {Object} parsedMessage - Parsed message object
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   */
  static async processMessage(ws, user, parsedMessage, broadcaster) {
    const responseBase = {
      messageId: parsedMessage.messageId || null, // Use client messageId if provided
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

  /**
   * Handle sending a chat message.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} message - Parsed message object { type, content, channelId?, recipientId? }
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base object for responses
   */
  static async handleSendMessage(ws, user, message, broadcaster, responseBase) {
      const { content, channelId, recipientId } = message;

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
          this.sendResponse(ws, { ...responseBase, type: 'error', error: 'Message content cannot be empty.' });
          return;
      }
      if (!channelId && !recipientId) {
          this.sendResponse(ws, { ...responseBase, type: 'error', error: 'Message requires either channelId or recipientId.' });
          return;
      }
      if (channelId && recipientId) {
          this.sendResponse(ws, { ...responseBase, type: 'error', error: 'Message cannot have both channelId and recipientId.' });
          return;
      }

      try {
          let savedMessage;
          if (channelId) {
              // Channel message
              const canAccess = await ResourceAuthorizationService.canAccessChannel(user.id, channelId);
              if (!canAccess) {
                  throw new Error('User does not have access to this channel.');
              }
              // TODO: Check channel-specific send permissions if needed
              savedMessage = await MessageModel.create({
                  sender_id: user.id,
                  channel_id: channelId,
                  content: content
              });
              // Include sender details for broadcasting
              savedMessage.sender = { id: user.id, username: user.username };

              logger.debug({ userId: user.id, channelId, messageId: savedMessage.id }, 'Broadcasting channel message');
              broadcaster.broadcastToChannel(channelId, { type: 'new_message', data: savedMessage });

          } else {
              // Direct message
              const recipientExists = await UserModel.findById(recipientId);
              if (!recipientExists) {
                  throw new Error('Recipient user not found.');
              }
              savedMessage = await MessageModel.create({
                  sender_id: user.id,
                  recipient_id: recipientId,
                  content: content
              });
              // Include sender details for broadcasting
              savedMessage.sender = { id: user.id, username: user.username };

              logger.debug({ userId: user.id, recipientId, messageId: savedMessage.id }, 'Broadcasting direct message');
              // Send to recipient and sender (for confirmation/sync)
              broadcaster.broadcastToUsers([recipientId, user.id], { type: 'new_message', data: savedMessage });
          }

          // Send confirmation back to sender (optional, but good practice)
          this.sendResponse(ws, {
              ...responseBase,
              type: 'message_sent_confirmation',
              messageId: savedMessage.id, // Confirm the ID assigned by the DB
              timestamp: savedMessage.created_at // Confirm the server timestamp
          });

          await AuditModel.log({
              userId: user.id,
              action: 'send_message',
              details: { messageId: savedMessage.id, channelId, recipientId }
          });

          // Trigger notifications (async, don't wait)
          NotificationService.handleNewMessage(savedMessage).catch(err => {
              logger.error({ err }, 'Error handling notification for new message');
          });

      } catch (error) {
          logger.error({ err: error, userId: user.id, message }, 'Error handling send_message');
          this.sendResponse(ws, { ...responseBase, type: 'error', error: error.message || 'Failed to send message.' });
          await AuditModel.log({
              userId: user.id,
              action: 'send_message_failed',
              details: { error: error.message, channelId, recipientId }
          });
      }
  }

  /**
   * Handle joining a channel.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} message - Parsed message object { type, channelId }
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base object for responses
   */
  static async handleJoinChannel(ws, user, message, broadcaster, responseBase) {
      const { channelId } = message;
      if (!channelId) {
          this.sendResponse(ws, { ...responseBase, type: 'error', error: 'channelId is required to join.' });
          return;
      }

      try {
          const canAccess = await ResourceAuthorizationService.canAccessChannel(user.id, channelId);
          if (!canAccess) {
              throw new Error('Access denied to this channel.');
          }

          broadcaster.subscribe(ws, channelId);
          logger.info({ userId: user.id, channelId }, 'User joined channel');

          // Send confirmation back to user
          this.sendResponse(ws, { ...responseBase, type: 'channel_join_success', channelId });

          // Notify others in the channel
          broadcaster.broadcastToChannel(channelId, {
              type: 'member_joined',
              data: {
                  channelId: channelId,
                  userId: user.id,
                  username: user.username,
                  timestamp: new Date().toISOString()
              }
          }, ws); // Exclude the user who just joined

          await AuditModel.log({
              userId: user.id,
              action: 'join_channel',
              details: { channelId }
          });

      } catch (error) {
          logger.error({ err: error, userId: user.id, channelId }, 'Error handling join_channel');
          this.sendResponse(ws, { ...responseBase, type: 'error', error: error.message || 'Failed to join channel.' });
          await AuditModel.log({
              userId: user.id,
              action: 'join_channel_failed',
              details: { error: error.message, channelId }
          });
      }
  }

  /**
   * Handle leaving a channel.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} message - Parsed message object { type, channelId }
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base object for responses
   */
  static async handleLeaveChannel(ws, user, message, broadcaster, responseBase) {
      const { channelId } = message;
      if (!channelId) {
          // If no channelId specified, maybe leave all? Or error? For now, error.
          this.sendResponse(ws, { ...responseBase, type: 'error', error: 'channelId is required to leave.' });
          return;
      }

      try {
          broadcaster.unsubscribe(ws, channelId);
          logger.info({ userId: user.id, channelId }, 'User left channel');

          // Send confirmation back to user
          this.sendResponse(ws, { ...responseBase, type: 'channel_leave_success', channelId });

          // Notify others in the channel
          broadcaster.broadcastToChannel(channelId, {
              type: 'member_left',
              data: {
                  channelId: channelId,
                  userId: user.id,
                  username: user.username,
                  timestamp: new Date().toISOString()
              }
          }); // No exclusion needed here

          await AuditModel.log({
              userId: user.id,
              action: 'leave_channel',
              details: { channelId }
          });

      } catch (error) {
          logger.error({ err: error, userId: user.id, channelId }, 'Error handling leave_channel');
          this.sendResponse(ws, { ...responseBase, type: 'error', error: error.message || 'Failed to leave channel.' });
          await AuditModel.log({
              userId: user.id,
              action: 'leave_channel_failed',
              details: { error: error.message, channelId }
          });
      }
  }

  /**
   * Handle editing a chat message.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user (with permissions)
   * @param {Object} message - Parsed message object { type, messageId, newContent }
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base object for responses
   */
  static async handleEditMessage(ws, user, message, broadcaster, responseBase) {
      const { messageId, newContent } = message;

      if (!messageId || !newContent || typeof newContent !== 'string' || newContent.trim().length === 0) {
          this.sendResponse(ws, { ...responseBase, type: 'error', error: 'messageId and valid newContent are required.' });
          return;
      }

      try {
          const originalMessage = await MessageModel.findById(messageId);
          if (!originalMessage) {
              throw new Error('Message not found.');
          }

          // Permission Check: Only original sender can edit
          if (originalMessage.sender_id !== user.id) {
              // Allow admins to edit? For now, no.
              // const isAdmin = PermissionService.hasPermission(user.permissions, 'message:edit:any');
              // if (!isAdmin) {
                   throw new Error('You can only edit your own messages.');
              // }
          }

          // Perform the update
          const updatedMessage = await MessageModel.update(messageId, {
              content: newContent,
              edited_at: new Date() // Add or update edited timestamp
          });

          // Include sender details for broadcasting consistency
          updatedMessage.sender = { id: originalMessage.sender_id, username: user.username }; // Assume username from current user is correct sender

          logger.info({ userId: user.id, messageId }, 'Message edited');

          // Broadcast the update
          if (updatedMessage.channel_id) {
              broadcaster.broadcastToChannel(updatedMessage.channel_id, { type: 'message_updated', data: updatedMessage });
          } else if (updatedMessage.recipient_id) {
              // Broadcast to sender and recipient in a DM
              broadcaster.broadcastToUsers([originalMessage.sender_id, updatedMessage.recipient_id], { type: 'message_updated', data: updatedMessage });
          }

          // Send confirmation back to editor
          this.sendResponse(ws, { ...responseBase, type: 'message_edit_success', messageId: updatedMessage.id });

          await AuditModel.log({
              userId: user.id,
              action: 'edit_message',
              details: { messageId: updatedMessage.id, channelId: updatedMessage.channel_id, recipientId: updatedMessage.recipient_id }
          });

      } catch (error) {
          logger.error({ err: error, userId: user.id, messageId }, 'Error handling edit_message');
          this.sendResponse(ws, { ...responseBase, type: 'error', error: error.message || 'Failed to edit message.' });
          await AuditModel.log({
              userId: user.id,
              action: 'edit_message_failed',
              details: { error: error.message, messageId }
          });
      }
  }

  /**
   * Handle deleting a chat message.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user (with permissions)
   * @param {Object} message - Parsed message object { type, messageId }
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base object for responses
   */
  static async handleDeleteMessage(ws, user, message, broadcaster, responseBase) {
      const { messageId } = message;

      if (!messageId) {
          this.sendResponse(ws, { ...responseBase, type: 'error', error: 'messageId is required.' });
          return;
      }

      try {
          const originalMessage = await MessageModel.findById(messageId);
          if (!originalMessage) {
              // Message already deleted or never existed, treat as success? Or error?
              // Let's send success to avoid client confusion if they double-click.
              logger.warn({ userId: user.id, messageId }, 'Attempted to delete non-existent message');
              this.sendResponse(ws, { ...responseBase, type: 'message_delete_success', messageId });
              return;
          }

          let canDelete = false;
          const isDM = !originalMessage.channel_id && originalMessage.recipient_id;

          if (isDM) {
              // DM: Only original sender can delete
              if (originalMessage.sender_id === user.id) {
                  canDelete = true;
              }
          } else {
              // Channel: Only Admins can delete
              // Assuming PermissionService is correctly set up
              if (PermissionService.hasPermission(user.permissions, 'message:delete:any')) {
                  canDelete = true;
              }
          }

          if (!canDelete) {
              throw new Error('You do not have permission to delete this message.');
          }

          // Perform the deletion (hard delete for now)
          await MessageModel.delete(messageId);

          logger.info({ userId: user.id, messageId, isAdminDelete: !isDM }, 'Message deleted');

          // Broadcast the deletion event
          const deleteEventData = { messageId: messageId, channelId: originalMessage.channel_id, recipientId: originalMessage.recipient_id };
          if (originalMessage.channel_id) {
              broadcaster.broadcastToChannel(originalMessage.channel_id, { type: 'message_deleted', data: deleteEventData });
          } else if (originalMessage.recipient_id) {
              // Broadcast to sender and recipient in a DM
              broadcaster.broadcastToUsers([originalMessage.sender_id, originalMessage.recipient_id], { type: 'message_deleted', data: deleteEventData });
          }

          // Send confirmation back to deleter
          this.sendResponse(ws, { ...responseBase, type: 'message_delete_success', messageId });

          await AuditModel.log({
              userId: user.id,
              action: 'delete_message',
              details: { messageId, channelId: originalMessage.channel_id, recipientId: originalMessage.recipient_id, deletedByAdmin: !isDM }
          });

      } catch (error) {
          logger.error({ err: error, userId: user.id, messageId }, 'Error handling delete_message');
          this.sendResponse(ws, { ...responseBase, type: 'error', error: error.message || 'Failed to delete message.' });
          await AuditModel.log({
              userId: user.id,
              action: 'delete_message_failed',
              details: { error: error.message, messageId }
          });
      }
  }

  /**
   * Handle read receipt messages (for DMs only).
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} message - Parsed message object { type, messageId }
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base object for responses
   */
  static async handleReadReceipt(ws, user, message, broadcaster, responseBase) {
      const { messageId } = message;

      if (!messageId) {
          this.sendResponse(ws, { ...responseBase, type: 'error', error: 'messageId is required for read receipt.' });
          return;
      }

      try {
          const originalMessage = await MessageModel.findById(messageId);
          if (!originalMessage) {
              // Ignore receipt for non-existent message
              logger.warn({ userId: user.id, messageId }, 'Read receipt received for non-existent message');
              return;
          }

          // Check if it's a DM and if the current user is the recipient
          const isDM = !originalMessage.channel_id && originalMessage.recipient_id;
          if (!isDM) {
              logger.warn({ userId: user.id, messageId }, 'Read receipt received for non-DM message, ignoring.');
              return; // Only process for DMs
          }
          if (originalMessage.recipient_id !== user.id) {
              logger.warn({ userId: user.id, messageId, recipientId: originalMessage.recipient_id }, 'Read receipt received from user who is not the recipient, ignoring.');
              return; // User sending receipt must be the recipient
          }

          // TODO: Persist read status in DB if needed (requires schema change)
          // e.g., await MessageModel.markAsRead(messageId, user.id);

          logger.debug({ userId: user.id, messageId, senderId: originalMessage.sender_id }, 'Processing read receipt');

          // Broadcast the read receipt *only* to the original sender
          broadcaster.broadcastToUsers([originalMessage.sender_id], {
              type: 'read_receipt_update',
              data: {
                  messageId: messageId,
                  readerId: user.id, // ID of the user who read the message
                  readAt: new Date().toISOString()
                  // Include conversation ID if applicable/needed by client
              }
          });

          // No confirmation needed back to the reader usually
          // this.sendResponse(ws, { ...responseBase, type: 'read_receipt_processed', messageId });

          await AuditModel.log({
              userId: user.id,
              action: 'read_receipt_sent',
              details: { messageId, originalSenderId: originalMessage.sender_id }
          });

      } catch (error) {
          logger.error({ err: error, userId: user.id, messageId }, 'Error handling read_receipt');
          // Don't usually send error back for receipts unless debugging
          // this.sendResponse(ws, { ...responseBase, type: 'error', error: 'Failed to process read receipt.' });
          await AuditModel.log({
              userId: user.id,
              action: 'read_receipt_failed',
              details: { error: error.message, messageId }
          });
      }
  }


  /**
   * Handle typing indicator messages.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} message - Parsed message object { type, isTyping, channelId?, recipientId? }
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base object for responses
   */
  static async handleTypingIndicator(ws, user, message, broadcaster, responseBase) {
    // ... (handleTypingIndicator implementation as before) ...
    const { isTyping, channelId, recipientId } = message;

    // Basic validation
    if (typeof isTyping !== 'boolean') {
      logger.warn({ userId: user.id, message }, 'Invalid typing indicator: isTyping missing or not boolean');
      this.sendResponse(ws, { ...responseBase, type: 'error', error: 'Invalid typing indicator format' });
      return;
    }
    if (!channelId && !recipientId) {
        logger.warn({ userId: user.id, message }, 'Invalid typing indicator: channelId or recipientId required');
        this.sendResponse(ws, { ...responseBase, type: 'error', error: 'Missing channelId or recipientId' });
        return;
    }

    try {
      const typingPayload = {
        userId: user.id,
        username: user.username, // Include username for display
        isTyping: isTyping,
        timestamp: new Date().toISOString()
      };

      if (recipientId) {
        // Direct message typing indicator
        logger.debug({ userId: user.id, recipientId, isTyping }, 'Broadcasting DM typing indicator');
        broadcaster.broadcastToUsers([recipientId], {
          type: 'user_typing',
          data: {
            ...typingPayload,
            isDirectMessage: true,
            senderId: user.id // Indicate who is typing to the recipient
          }
        }, ws); // Exclude sender
      } else if (channelId) {
        // Channel typing indicator
        // Optional: Check if user is actually in the channel before broadcasting
        const canAccess = await ResourceAuthorizationService.canAccessChannel(user.id, channelId);
        if (!canAccess) {
            logger.warn({ userId: user.id, channelId }, 'User attempted to send typing indicator to unauthorized channel');
            // Optionally send an error back, or just ignore silently
            return;
        }

        logger.debug({ userId: user.id, channelId, isTyping }, 'Broadcasting channel typing indicator');
        broadcaster.broadcastToChannel(channelId, {
          type: 'user_typing',
          data: {
            ...typingPayload,
            channelId: channelId,
            isDirectMessage: false
          }
        }, ws); // Exclude sender
      }

      // No explicit response needed for typing indicators usually
    } catch (error) {
      logger.error({ err: error, userId: user.id, message }, 'Error handling typing indicator');
      // Don't necessarily send error back to client for typing indicators
    }
  }

  /**
   * Handle request for channel list.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} responseBase - Base object for responses
   */
  static async handleChannelListRequest(ws, user, responseBase) {
      try {
          // Fetch channels accessible by the user
          const channels = await ChannelModel.findAccessibleByUser(user.id);
          logger.debug({ userId: user.id, count: channels.length }, 'Sending channel list');
          this.sendResponse(ws, {
              ...responseBase,
              type: 'channel_list',
              data: channels
          });
      } catch (error) {
          logger.error({ err: error, userId: user.id }, 'Error handling channel_list_request');
          this.sendResponse(ws, { ...responseBase, type: 'error', error: 'Failed to retrieve channel list.' });
      }
  }


  /**
   * Send response to client.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} data - Response data
   */
  static sendResponse(ws, data) {
    // ... (sendResponse implementation as before) ...
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
    // ... (extractTokenFromRequest implementation as before) ...
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
