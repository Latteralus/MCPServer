const UserModel = require('../models/userModel');
const MessageModel = require('../models/messageModel');
const ChannelModel = require('../models/channelModel');
const AuthService = require('../services/authService');
const PermissionService = require('../services/permissionService');
const NotificationService = require('../services/notificationService');
const AuditModel = require('../models/auditModel');
const config = require('.../config');
const port = config.port;

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
   * @returns {Promise<void>}
   */
  static async handleMessage(ws, user, message) {
    try {
      // Parse incoming message
      const parsedMessage = JSON.parse(message);

      switch (parsedMessage.type) {
        case 'send_message':
          await this.handleSendMessage(user, parsedMessage);
          break;
        
        case 'join_channel':
          await this.handleJoinChannel(user, parsedMessage);
          break;
        
        case 'leave_channel':
          await this.handleLeaveChannel(user, parsedMessage);
          break;
        
        case 'edit_message':
          await this.handleEditMessage(user, parsedMessage);
          break;
        
        case 'delete_message':
          await this.handleDeleteMessage(user, parsedMessage);
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
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  }

  /**
   * Handle sending a message
   * @param {Object} user - Sending user
   * @param {Object} messageData - Message details
   */
  static async handleSendMessage(user, messageData) {
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

        // Trigger channel last activity update
        await ChannelModel.updateLastActivity(messageData.channelId);

        return message;
      }
    );
  }

  /**
   * Handle joining a channel
   * @param {Object} user - User joining channel
   * @param {Object} channelData - Channel join details
   */
  static async handleJoinChannel(user, channelData) {
    // Validate user has permission to join channels
    await PermissionService.authorizeAction(
      user.id, 
      'channel.invite', 
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

        // Send notification to channel members
        await NotificationService.sendChannelNotification(
          channelId, 
          {
            message: `${user.username} has joined the channel`,
            type: 'member_joined'
          }
        );
      }
    );
  }

  /**
   * Handle leaving a channel
   * @param {Object} user - User leaving channel
   * @param {Object} channelData - Channel leave details
   */
  static async handleLeaveChannel(user, channelData) {
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

    // Send notification to remaining channel members
    await NotificationService.sendChannelNotification(
      channelId, 
      {
        message: `${user.username} has left the channel`,
        type: 'member_left'
      }
    );
  }

  /**
   * Handle editing a message
   * @param {Object} user - User editing message
   * @param {Object} editData - Message edit details
   */
  static async handleEditMessage(user, editData) {
    // Validate user has permission to edit messages
    await PermissionService.authorizeAction(
      user.id, 
      'message.update', 
      async () => {
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
            messageId: editData.messageId 
          }
        });

        return updatedMessage;
      }
    );
  }

  /**
   * Handle deleting a message
   * @param {Object} user - User deleting message
   * @param {Object} deleteData - Message delete details
   */
  static async handleDeleteMessage(user, deleteData) {
    // Validate user has permission to delete messages
    await PermissionService.authorizeAction(
      user.id, 
      'message.delete', 
      async () => {
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
            permanent: deleteData.permanent || false 
          }
        });
      }
    );
  }

  /**
   * Extract authentication token from request
   * @param {Object} req - HTTP request
   * @returns {string|null} Authentication token
   */
  static extractTokenFromRequest(req) {
    // In a local network, this could be from query params, headers, or cookies
    // Implement token extraction logic specific to your authentication method
    return req.headers['authorization']?.replace('Bearer ', '');
  }
}

module.exports = WebSocketHandlers;