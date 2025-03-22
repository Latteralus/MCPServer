const UserModel = require('../models/userModel');
const MessageModel = require('../models/messageModel');
const ChannelModel = require('../models/channelModel');
const AuthService = require('../services/authService');
const PermissionService = require('../services/permissionService');
const NotificationService = require('../services/notificationService');
const AuditModel = require('../models/auditModel');
const config = require('../config');

class WebSocketHandlers {
  /**
   * Authenticate WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} req - HTTP request
   * @returns {Promise<Object|null>} Authenticated user or null
   */
  static async authenticate(ws, req) {
    try {
      // Extract token from connection request
      const token = this.extractTokenFromRequest(req);

      if (!token) {
        throw new Error('No authentication token provided');
      }

      // Validate session token
      const user = await AuthService.validateSessionToken(token);

      if (!user) {
        throw new Error('Invalid authentication token');
      }

      // Log successful authentication
      await AuditModel.log({
        userId: user.id,
        action: 'websocket_connect',
        details: { 
          remoteAddress: req.socket.remoteAddress 
        }
      });

      return user;
    } catch (error) {
      console.error('WebSocket authentication error:', error);
      
      await AuditModel.log({
        action: 'websocket_connect_failed',
        details: { 
          error: error.message,
          remoteAddress: req.socket.remoteAddress 
        }
      });

      return null;
    }
  }

  /**
   * Handle incoming WebSocket messages
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {string} message - Incoming message
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @returns {Promise<void>}
   */
  static async handleMessage(ws, user, message, broadcaster) {
    try {
      // Parse incoming message
      const parsedMessage = JSON.parse(message);

      // Set common response data
      const responseBase = {
        messageId: parsedMessage.messageId || null,
        timestamp: new Date().toISOString()
      };

      // Process based on message type
      switch (parsedMessage.type) {
        case 'send_message':
          await this.handleSendMessage(ws, user, parsedMessage, broadcaster, responseBase);
          break;
        
        case 'join_channel':
          await this.handleJoinChannel(ws, user, parsedMessage, broadcaster, responseBase);
          break;
        
        case 'leave_channel':
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
          // Simple ping-pong for connection testing
          this.sendResponse(ws, {
            ...responseBase,
            type: 'pong'
          });
          break;
        
        default:
          throw new Error('Unknown message type');
      }
    } catch (error) {
      console.error('WebSocket message handling error:', error);
      
      await AuditModel.log({
        userId: user.id,
        action: 'websocket_message_error',
        details: { 
          error: error.message 
        }
      });

      // Send error response back to client
      this.sendResponse(ws, {
        type: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle sending a message
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} messageData - Message data
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base response data
   */
  static async handleSendMessage(ws, user, messageData, broadcaster, responseBase) {
    // Validate user has permission to send messages
    await PermissionService.authorizeAction(
      user.id, 
      'message.create', 
      async () => {
        // Check if user is a member of the channel
        const isMember = await ChannelModel.isMember(
          messageData.channelId, 
          user.id
        );

        if (!isMember) {
          throw new Error('Not a member of this channel');
        }

        // Create message
        const message = await MessageModel.create({
          channelId: messageData.channelId,
          senderId: user.id,
          text: messageData.text,
          containsPHI: messageData.containsPHI || false
        });

        // Log message creation
        await AuditModel.log({
          userId: user.id,
          action: 'message_sent',
          details: { 
            channelId: messageData.channelId,
            messageId: message.id 
          }
        });

        // Update channel last activity
        await ChannelModel.updateLastActivity(messageData.channelId);

        // Broadcast to channel
        await broadcaster.broadcastNewMessage(message);

        // Send confirmation back to sender
        this.sendResponse(ws, {
          ...responseBase,
          type: 'message_sent',
          message
        });

        return message;
      }
    );
  }

  /**
   * Handle joining a channel
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} channelData - Channel data
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base response data
   */
  static async handleJoinChannel(ws, user, channelData, broadcaster, responseBase) {
    // Validate user has permission to join channels
    await PermissionService.authorizeAction(
      user.id, 
      'channel.join', 
      async () => {
        const channelId = channelData.channelId;

        // Check channel exists and is not private
        const channel = await ChannelModel.getById(channelId);
        
        if (!channel) {
          throw new Error('Channel not found');
        }

        if (channel.isPrivate) {
          throw new Error('Cannot join private channel');
        }

        // Add user to channel
        await ChannelModel.addMember(channelId, user.id);

        // Log channel join
        await AuditModel.log({
          userId: user.id,
          action: 'channel_joined',
          details: { channelId }
        });

        // Add channel to connection's channel set
        await broadcaster.joinChannel(ws, channelId);

        // Broadcast member join notification
        await broadcaster.broadcastMemberJoin(channelId, user);

        // Send confirmation back to user
        this.sendResponse(ws, {
          ...responseBase,
          type: 'channel_joined',
          channelId,
          channel
        });
      }
    );
  }

  /**
   * Handle leaving a channel
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} channelData - Channel data
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base response data
   */
  static async handleLeaveChannel(ws, user, channelData, broadcaster, responseBase) {
    const channelId = channelData.channelId;

    // Check user is a member of the channel
    const isMember = await ChannelModel.isMember(channelId, user.id);
    
    if (!isMember) {
      throw new Error('Not a member of this channel');
    }

    // Remove user from channel
    await ChannelModel.removeMember(channelId, user.id);

    // Log channel leave
    await AuditModel.log({
      userId: user.id,
      action: 'channel_left',
      details: { channelId }
    });

    // Remove channel from connection's channel set
    await broadcaster.leaveChannel(ws, channelId);

    // Broadcast member leave notification
    await broadcaster.broadcastMemberLeave(channelId, user);

    // Send confirmation back to user
    this.sendResponse(ws, {
      ...responseBase,
      type: 'channel_left',
      channelId
    });
  }

  /**
   * Handle editing a message
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} editData - Edit data
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base response data
   */
  static async handleEditMessage(ws, user, editData, broadcaster, responseBase) {
    // Validate user has permission to edit messages
    await PermissionService.authorizeAction(
      user.id, 
      'message.update', 
      async () => {
        // Get original message to check channel
        const originalMessage = await MessageModel.getById(editData.messageId, user.id);
        
        if (!originalMessage) {
          throw new Error('Message not found');
        }
        
        // Only message author can edit
        if (originalMessage.senderId !== user.id) {
          throw new Error('Not authorized to edit this message');
        }

        // Update message
        const updatedMessage = await MessageModel.update(
          editData.messageId, 
          user.id, 
          { text: editData.newText }
        );

        // Log message edit
        await AuditModel.log({
          userId: user.id,
          action: 'message_edited',
          details: { 
            messageId: editData.messageId,
            channelId: originalMessage.channelId
          }
        });

        // Broadcast update to channel
        await broadcaster.broadcastMessageUpdate({
          ...updatedMessage,
          channelId: originalMessage.channelId
        });

        // Send confirmation back to user
        this.sendResponse(ws, {
          ...responseBase,
          type: 'message_updated',
          message: updatedMessage
        });

        return updatedMessage;
      }
    );
  }

  /**
   * Handle deleting a message
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} deleteData - Delete data
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base response data
   */
  static async handleDeleteMessage(ws, user, deleteData, broadcaster, responseBase) {
    // Validate user has permission to delete messages
    await PermissionService.authorizeAction(
      user.id, 
      'message.delete', 
      async () => {
        // Get original message to check channel
        const originalMessage = await MessageModel.getById(deleteData.messageId, user.id);
        
        if (!originalMessage) {
          throw new Error('Message not found');
        }
        
        // Only message author or admin can delete
        const isAdmin = await PermissionService.hasPermission(user.id, 'admin.messages');
        if (originalMessage.senderId !== user.id && !isAdmin) {
          throw new Error('Not authorized to delete this message');
        }

        // Delete message
        await MessageModel.delete(
          deleteData.messageId, 
          user.id, 
          deleteData.permanent || false
        );

        // Log message deletion
        await AuditModel.log({
          userId: user.id,
          action: 'message_deleted',
          details: { 
            messageId: deleteData.messageId,
            channelId: originalMessage.channelId,
            permanent: deleteData.permanent || false 
          }
        });

        // Broadcast deletion to channel
        await broadcaster.broadcastMessageDeletion(
          deleteData.messageId, 
          originalMessage.channelId
        );

        // Send confirmation back to user
        this.sendResponse(ws, {
          ...responseBase,
          type: 'message_deleted',
          messageId: deleteData.messageId
        });
      }
    );
  }

  /**
   * Handle typing indicator
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} typingData - Typing data
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base response data
   */
  static async handleTypingIndicator(ws, user, typingData, broadcaster, responseBase) {
    const { channelId, isTyping } = typingData;
    
    // Check if user is a member of the channel
    const isMember = await ChannelModel.isMember(channelId, user.id);
    
    if (!isMember) {
      throw new Error('Not a member of this channel');
    }

    // Broadcast typing status to channel
    await broadcaster.broadcastToChannel(channelId, {
      type: 'typing_indicator',
      userId: user.id,
      username: user.username,
      channelId,
      isTyping,
      timestamp: new Date().toISOString()
    });

    // No need to send a response to the user
  }

  /**
   * Handle read receipt
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} readData - Read receipt data
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @param {Object} responseBase - Base response data
   */
  static async handleReadReceipt(ws, user, readData, broadcaster, responseBase) {
    const { channelId, lastReadMessageId } = readData;
    
    // Check if user is a member of the channel
    const isMember = await ChannelModel.isMember(channelId, user.id);
    
    if (!isMember) {
      throw new Error('Not a member of this channel');
    }

    // Update last read timestamp for user in channel
    await ChannelModel.updateLastRead(channelId, user.id, lastReadMessageId);

    // Broadcast read receipt to channel (optional, depending on privacy requirements)
    if (readData.broadcast) {
      await broadcaster.broadcastToChannel(channelId, {
        type: 'read_receipt',
        userId: user.id,
        username: user.username,
        channelId,
        lastReadMessageId,
        timestamp: new Date().toISOString()
      });
    }

    // Acknowledge receipt
    this.sendResponse(ws, {
      ...responseBase,
      type: 'read_receipt_ack',
      channelId,
      lastReadMessageId
    });
  }

  /**
   * Send response to client
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} data - Response data
   */
  static sendResponse(ws, data) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Extract authentication token from request
   * @param {Object} req - HTTP request
   * @returns {string|null} Authentication token
   */
  static extractTokenFromRequest(req) {
    // Try to extract from URL parameters
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const tokenFromUrl = parsedUrl.searchParams.get('token');
    
    if (tokenFromUrl) {
      return tokenFromUrl;
    }
    
    // Try to extract from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    
    // Try to extract from Sec-WebSocket-Protocol
    // Some clients use this as a way to pass authentication
    const protocol = req.headers['sec-websocket-protocol'];
    if (protocol && protocol.startsWith('token.')) {
      return protocol.slice(6);
    }
    
    return null;
  }
}

module.exports = WebSocketHandlers;