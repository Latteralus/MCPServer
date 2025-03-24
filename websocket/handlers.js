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
      // Wait for authentication message with timeout
      const authMessage = await this.waitForAuthMessage(ws);
      
      if (!authMessage || !authMessage.token) {
        console.log('Authentication failed: No valid auth message received');
        ws.send(JSON.stringify({
          type: 'authentication_response',
          success: false,
          reason: 'No authentication credentials provided'
        }));
        return null;
      }
      
      // Validate the token with AuthService
      const user = await AuthService.validateSessionToken(authMessage.token);
      
      if (!user) {
        console.log('Authentication failed: Invalid token');
        ws.send(JSON.stringify({
          type: 'authentication_response',
          success: false,
          reason: 'Invalid or expired token'
        }));
        return null;
      }
      
      // Send authentication success
      ws.send(JSON.stringify({
        type: 'authentication_response',
        success: true,
        user: {
          id: user.id,
          username: user.username
        }
      }));
      
      console.log(`User authenticated: ${user.username}`);
      
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
      
      ws.send(JSON.stringify({
        type: 'authentication_response',
        success: false,
        reason: 'Authentication error'
      }));
      
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
   * Wait for authentication message
   * @param {WebSocket} ws - WebSocket connection
   * @returns {Promise<Object|null>} Authentication message or null if not received
   */
  static waitForAuthMessage(ws) {
    return new Promise((resolve) => {
      const messageHandler = (message) => {
        try {
          // Handle both string and Buffer messages
          let messageStr;
          if (Buffer.isBuffer(message)) {
            messageStr = message.toString('utf8');
          } else if (typeof message === 'string') {
            messageStr = message;
          } else {
            console.error('Unhandled message type:', typeof message);
            return;
          }

          const parsed = JSON.parse(messageStr);
          if (parsed.type === 'authenticate') {
            ws.removeEventListener('message', messageHandler);
            resolve(parsed);
          }
        } catch (e) {
          console.error('Error parsing authentication message:', e);
        }
      };
      
      ws.addEventListener('message', messageHandler);
      
      // Also handle connection close
      const closeHandler = () => {
        ws.removeEventListener('message', messageHandler);
        ws.removeEventListener('close', closeHandler);
        resolve(null);
      };
      
      ws.addEventListener('close', closeHandler);
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {string|Buffer} message - Incoming message
   * @param {WebSocketBroadcaster} broadcaster - Broadcaster instance
   * @returns {Promise<void>}
   */
  static async handleMessage(ws, user, message, broadcaster) {
    try {
      // Log raw message for debugging
      console.log('Raw message received:', typeof message, message instanceof Buffer ? 'Buffer' : '', 
          message instanceof Buffer ? `Length: ${message.length}` : '');
      
      // Parse incoming message - handle Buffer or string
      let messageText;
      if (Buffer.isBuffer(message)) {
        messageText = message.toString('utf8');
      } else if (typeof message === 'string') {
        messageText = message;
      } else {
        console.error('Unknown message format:', typeof message);
        this.sendResponse(ws, {
          type: 'error',
          error: 'Unknown message format',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      console.log('Message text:', messageText);
      
      let parsedMessage;
      try {
        parsedMessage = JSON.parse(messageText);
      } catch (parseError) {
        console.error('Failed to parse message:', parseError);
        this.sendResponse(ws, {
          type: 'error',
          error: 'Invalid message format. Expected JSON.',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Log parsed message for debugging
      console.log('Parsed message:', JSON.stringify(parsedMessage, null, 2));
      
      // Check for type property
      if (!parsedMessage.type) {
        console.error('Message missing type property:', JSON.stringify(parsedMessage));
        this.sendResponse(ws, {
          type: 'error',
          error: 'Message missing type property',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Set common response data
      const responseBase = {
        messageId: parsedMessage.messageId || null,
        timestamp: new Date().toISOString()
      };

      // Process based on message type
      switch (parsedMessage.type) {
        case 'send_message':
        case 'chat_message':  // Add support for 'chat_message' type
          await this.handleSendMessage(ws, user, parsedMessage, broadcaster, responseBase);
          break;
        
        case 'join_channel':
        case 'channel_join':  // Add support for 'channel_join' type
          await this.handleJoinChannel(ws, user, parsedMessage, broadcaster, responseBase);
          break;
        
        case 'leave_channel':
        case 'channel_leave':  // Add support for 'channel_leave' type
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
        case 'heartbeat':  // Add support for 'heartbeat' type
          // Simple ping-pong for connection testing
          this.sendResponse(ws, {
            ...responseBase,
            type: 'pong',
            timestamp: new Date().toISOString()
          });
          break;

        case 'channel_list_request':
          // FIXED: Now properly fetches channels from database
          await this.handleChannelListRequest(ws, user, responseBase);
          break;
        
        case 'authenticate':
          // Authentication should be handled separately, but we'll acknowledge it
          this.sendResponse(ws, {
            ...responseBase,
            type: 'authentication_response',
            success: true,
            message: 'Already authenticated'
          });
          break;
          
        default:
          console.warn(`Unknown message type: ${parsedMessage.type}`, JSON.stringify(parsedMessage));
          this.sendResponse(ws, {
            ...responseBase,
            type: 'error',
            error: `Unknown message type: ${parsedMessage.type}`,
            supportedTypes: [
              'send_message', 'chat_message', 
              'join_channel', 'channel_join',
              'leave_channel', 'channel_leave',
              'edit_message', 'delete_message',
              'typing_indicator', 'read_receipt',
              'ping', 'heartbeat', 'channel_list_request'
            ].join(', '),
            timestamp: new Date().toISOString()
          });
      }
    } catch (error) {
      console.error('WebSocket message handling error:', error);
      
      try {
        // Log error if possible
        await AuditModel.log({
          userId: user.id,
          action: 'websocket_message_error',
          details: { 
            error: error.message 
          }
        });
      } catch (logError) {
        console.error('Error logging message error:', logError);
      }

      // Send error response back to client
      this.sendResponse(ws, {
        type: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Check if user is a local developer (username = "Local Developer")
   * @param {Object} user - User object
   * @returns {boolean} True if user is a local developer
   */
  static isLocalDeveloper(user) {
    return !user.id || user.username === 'Local Developer';
  }

  /**
   * Handle channel list request
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   * @param {Object} responseBase - Base response data
   */
  static async handleChannelListRequest(ws, user, responseBase) {
    try {
      console.log('Channel list requested by', user.username);
      
      // Fetch channels from database
      let channels = [];
      
      // Query channels based on permissions
      const isAdmin = this.isLocalDeveloper(user) || await PermissionService.hasPermission(user.id, 'admin.channels');
      
      if (isAdmin) {
        // Admins can see all channels
        channels = await ChannelModel.search();
      } else {
        // Regular users can only see public channels and channels they're a member of
        const publicChannels = await ChannelModel.search({ isPrivate: false });
        
        // Check if ChannelModel.getUserChannels is available
        let memberChannels = [];
        
        try {
          // Use getUserChannels if available
          if (typeof ChannelModel.getUserChannels === 'function') {
            memberChannels = await ChannelModel.getUserChannels(user.id);
          } else {
            // Fallback to database query if method doesn't exist
            const db = require('../config/database');
            const channelMembers = await db.query(
              'SELECT channel_id FROM channel_members WHERE user_id = $1',
              [user.id]
            );
            
            if (channelMembers && channelMembers.rows) {
              const channelIds = channelMembers.rows.map(row => row.channel_id);
              
              // Only fetch these channels if we have some IDs
              if (channelIds.length > 0) {
                for (const channelId of channelIds) {
                  const channel = await ChannelModel.getById(channelId);
                  if (channel) {
                    memberChannels.push(channel);
                  }
                }
              }
            }
          }
        } catch (memberError) {
          console.warn('Error fetching user channels:', memberError);
          // Continue with public channels only
        }
        
        // Merge channels and remove duplicates
        const channelMap = new Map();
        [...publicChannels, ...memberChannels].forEach(channel => {
          channelMap.set(channel.id, channel);
        });
        
        channels = Array.from(channelMap.values());
      }
      
      // Add additional user-friendly properties
      const enhancedChannels = await Promise.all(channels.map(async channel => {
        // For local developer, always return true for isMember
        const isMember = this.isLocalDeveloper(user) ? true : await ChannelModel.isMember(channel.id, user.id);
        
        return {
          ...channel,
          isMember,
          type: channel.is_private ? 'private' : 'public',
          // Convert from snake_case to camelCase for client consumption
          isPrivate: channel.is_private,
          createdAt: channel.created_at,
          lastActivity: channel.last_activity,
          memberCount: channel.member_count || 0
        };
      }));
      
      // Log the channel list retrieval
      await AuditModel.log({
        userId: user.id,
        action: 'channel_list_request',
        details: { channelCount: enhancedChannels.length }
      });
      
      // Send the channel list to the client
      this.sendResponse(ws, {
        ...responseBase,
        type: 'channel_list_response',
        channels: enhancedChannels,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching channel list:', error);
      
      // Send error response
      this.sendResponse(ws, {
        ...responseBase,
        type: 'error',
        error: 'Failed to fetch channel list: ' + error.message,
        timestamp: new Date().toISOString()
      });
      
      // Log the error
      await AuditModel.log({
        userId: user.id,
        action: 'channel_list_request_failed',
        details: { error: error.message }
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
    try {
      // Support both payload wrapped and direct format
      const messageText = messageData.text || (messageData.payload && messageData.payload.text);
      const channelIdOrName = messageData.channelId || (messageData.payload && messageData.payload.channelId) || 'general';
      
      if (!messageText) {
        throw new Error('Message text is required');
      }
      
      // Check if user is a Local Developer (local testing)
      const isLocalDeveloper = this.isLocalDeveloper(user);
      
      // Create message function - shared between both paths
      const createAndBroadcastMessage = async () => {
        try {
          // First get the channel by ID or name - handles both UUID and string formats
          const channel = await ChannelModel.getByIdOrName(channelIdOrName);
          
          if (!channel) {
            throw new Error(`Channel not found: ${channelIdOrName}`);
          }
          
          // Check if user is a member of the channel
          const isMember = isLocalDeveloper || await ChannelModel.isMember(channel.id, user.id);

          if (!isMember) {
            // If not a member, try to join the channel first
            try {
              await ChannelModel.addMember(channel.id, user.id);
              await broadcaster.joinChannel(ws, channel.id);
              console.log(`User ${user.username} automatically joined channel ${channel.name}`);
            } catch (joinError) {
              console.error(`Failed to auto-join channel ${channelIdOrName}:`, joinError);
              throw new Error('Not a member of this channel');
            }
          }

          // Create message with the proper channel UUID
          const message = await MessageModel.create({
            channelId: channel.id, // Use the actual UUID from the database
            senderId: user.id || 'local_developer', // Use placeholder ID for local developer
            text: messageText,
            containsPHI: messageData.containsPHI || false
          });

          // Add sender info for broadcasting
          message.sender = user.username;
          message.senderUsername = user.username;

          // Log message creation
          await AuditModel.log({
            userId: user.id || 'local_developer',
            action: 'message_sent',
            details: { 
              channelId: channel.id,
              messageId: message.id 
            }
          });

          // Update channel last activity
          await ChannelModel.updateLastActivity(channel.id);

          // Broadcast to channel
          await broadcaster.broadcastNewMessage(message);

          // Send confirmation back to sender
          this.sendResponse(ws, {
            ...responseBase,
            type: 'message_sent',
            message
          });

          return message;
        } catch (error) {
          console.error('Error creating message:', error);
          throw error;
        }
      };
      
      // Handle based on user type
      if (isLocalDeveloper) {
        // Skip permission check for local developer
        console.log("Local developer sending message - bypassing permission check");
        await createAndBroadcastMessage();
      } else {
        // Regular user - validate permission
        await PermissionService.authorizeAction(
          user.id, 
          'message.create', 
          createAndBroadcastMessage
        );
      }
    } catch (error) {
      console.error('Error handling send message:', error);
      
      // Send error response
      this.sendResponse(ws, {
        ...responseBase,
        type: 'error',
        error: 'Failed to send message: ' + error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
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
    try {
      // Support both formats: channelId or channel property
      const channelIdOrName = channelData.channelId || channelData.channel || 'general';
      
      // Check if user is a Local Developer (local testing)
      const isLocalDeveloper = this.isLocalDeveloper(user);
      
      // Create join function - shared between both paths
      const joinChannelFunction = async () => {
        try {
          // Use getByIdOrName to handle both string names and UUIDs
          const channel = await ChannelModel.getByIdOrName(channelIdOrName);
          
          if (!channel) {
            throw new Error(`Channel not found: ${channelIdOrName}`);
          }

          if (channel.is_private && !isLocalDeveloper) {
            throw new Error('Cannot join private channel');
          }

          // Add user to channel
          if (!isLocalDeveloper) {
            await ChannelModel.addMember(channel.id, user.id);
          }

          // Log channel join
          await AuditModel.log({
            userId: user.id || 'local_developer',
            action: 'channel_joined',
            details: { channelId: channel.id }
          });

          // Add channel to connection's channel set
          await broadcaster.joinChannel(ws, channel.id);

          // Broadcast member join notification
          await broadcaster.broadcastMemberJoin(channel.id, user);

          // Send confirmation back to user
          this.sendResponse(ws, {
            ...responseBase,
            type: 'channel_joined',
            channelId: channel.id,
            channel
          });
          
          return true;
        } catch (error) {
          console.error(`Error joining channel ${channelIdOrName}:`, error);
          throw error;
        }
      };
      
      if (isLocalDeveloper) {
        // Skip permission check for local developer
        console.log("Local developer joining channel - bypassing permission check");
        await joinChannelFunction();
      } else {
        // Regular user - validate permission
        await PermissionService.authorizeAction(
          user.id, 
          'channel.join', 
          joinChannelFunction
        );
      }
    } catch (error) {
      // Send error response
      this.sendResponse(ws, {
        ...responseBase,
        type: 'error',
        error: 'Failed to join channel: ' + error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
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
    try {
      // Support both formats
      const channelIdOrName = channelData.channelId || channelData.channel;
      
      // Check if user is a Local Developer (local testing)
      const isLocalDeveloper = this.isLocalDeveloper(user);

      // Get channel by ID or name
      const channel = await ChannelModel.getByIdOrName(channelIdOrName);
      
      if (!channel) {
        throw new Error(`Channel not found: ${channelIdOrName}`);
      }

      // Check user is a member of the channel
      const isMember = isLocalDeveloper || await ChannelModel.isMember(channel.id, user.id);
      
      if (!isMember) {
        throw new Error('Not a member of this channel');
      }

      // Remove user from channel
      if (!isLocalDeveloper) {
        await ChannelModel.removeMember(channel.id, user.id);
      }

      // Log channel leave
      await AuditModel.log({
        userId: user.id || 'local_developer',
        action: 'channel_left',
        details: { channelId: channel.id }
      });

      // Remove channel from connection's channel set
      await broadcaster.leaveChannel(ws, channel.id);

      // Broadcast member leave notification
      await broadcaster.broadcastMemberLeave(channel.id, user);

      // Send confirmation back to user
      this.sendResponse(ws, {
        ...responseBase,
        type: 'channel_left',
        channelId: channel.id
      });
    } catch (error) {
      // Send error response
      this.sendResponse(ws, {
        ...responseBase,
        type: 'error',
        error: 'Failed to leave channel: ' + error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
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
    // Check if user is a Local Developer (local testing)
    const isLocalDeveloper = this.isLocalDeveloper(user);
    
    // Create edit function - shared between both paths
    const editMessageFunction = async () => {
      // Support both payload wrapped and direct format
      const messageId = editData.messageId || (editData.payload && editData.payload.messageId);
      const newText = editData.newText || (editData.payload && editData.payload.newText);

      if (!messageId || !newText) {
        throw new Error('Message ID and new text are required');
      }

      // Get original message to check channel
      const originalMessage = await MessageModel.getById(messageId, user.id || 'local_developer');
      
      if (!originalMessage) {
        throw new Error('Message not found');
      }
      
      // Only message author can edit (unless local developer)
      if (!isLocalDeveloper && originalMessage.senderId !== user.id) {
        throw new Error('Not authorized to edit this message');
      }

      // Update message
      const updatedMessage = await MessageModel.update(
        messageId, 
        user.id || 'local_developer', 
        { text: newText }
      );

      // Log message edit
      await AuditModel.log({
        userId: user.id || 'local_developer',
        action: 'message_edited',
        details: { 
          messageId: messageId,
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
    };
    
    try {
      if (isLocalDeveloper) {
        // Skip permission check for local developer
        console.log("Local developer editing message - bypassing permission check");
        await editMessageFunction();
      } else {
        // Regular user - validate permission
        await PermissionService.authorizeAction(
          user.id, 
          'message.update', 
          editMessageFunction
        );
      }
    } catch (error) {
      // Send error response
      this.sendResponse(ws, {
        ...responseBase,
        type: 'error',
        error: 'Failed to edit message: ' + error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
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
    // Check if user is a Local Developer (local testing)
    const isLocalDeveloper = this.isLocalDeveloper(user);
    
    // Create delete function - shared between both paths
    const deleteMessageFunction = async () => {
      // Support both payload wrapped and direct format
      const messageId = deleteData.messageId || (deleteData.payload && deleteData.payload.messageId);
      const permanent = deleteData.permanent || (deleteData.payload && deleteData.payload.permanent) || false;

      if (!messageId) {
        throw new Error('Message ID is required');
      }

      // Get original message to check channel
      const originalMessage = await MessageModel.getById(messageId, user.id || 'local_developer');
      
      if (!originalMessage) {
        throw new Error('Message not found');
      }
      
      // Only message author or admin can delete
      const isAdmin = isLocalDeveloper || await PermissionService.hasPermission(user.id, 'admin.messages');
      if (!isLocalDeveloper && originalMessage.senderId !== user.id && !isAdmin) {
        throw new Error('Not authorized to delete this message');
      }

      // Delete message
      await MessageModel.delete(
        messageId, 
        user.id || 'local_developer', 
        permanent
      );

      // Log message deletion
      await AuditModel.log({
        userId: user.id || 'local_developer',
        action: 'message_deleted',
        details: { 
          messageId: messageId,
          channelId: originalMessage.channelId,
          permanent: permanent 
        }
      });

      // Broadcast deletion to channel
      await broadcaster.broadcastMessageDeletion(
        messageId, 
        originalMessage.channelId
      );

      // Send confirmation back to user
      this.sendResponse(ws, {
        ...responseBase,
        type: 'message_deleted',
        messageId: messageId
      });
    };
    
    try {
      if (isLocalDeveloper) {
        // Skip permission check for local developer
        console.log("Local developer deleting message - bypassing permission check");
        await deleteMessageFunction();
      } else {
        // Regular user - validate permission
        await PermissionService.authorizeAction(
          user.id, 
          'message.delete', 
          deleteMessageFunction
        );
      }
    } catch (error) {
      // Send error response
      this.sendResponse(ws, {
        ...responseBase,
        type: 'error',
        error: 'Failed to delete message: ' + error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
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
    try {
      // Support both payload wrapped and direct format
      const channelIdOrName = typingData.channelId || (typingData.payload && typingData.payload.channelId) || 'general';
      const isTyping = typingData.isTyping !== undefined ? typingData.isTyping : 
                      (typingData.payload && typingData.payload.isTyping !== undefined ? typingData.payload.isTyping : true);
      
      // Check if user is a Local Developer (local testing)
      const isLocalDeveloper = this.isLocalDeveloper(user);
      
      // Get channel by ID or name
      const channel = await ChannelModel.getByIdOrName(channelIdOrName);
      
      if (!channel) {
        throw new Error(`Channel not found: ${channelIdOrName}`);
      }
      
      // Check if user is a member of the channel
      const isMember = isLocalDeveloper || await ChannelModel.isMember(channel.id, user.id);
      
      if (!isMember) {
        throw new Error('Not a member of this channel');
      }

      // Broadcast typing status to channel
      await broadcaster.broadcastToChannel(channel.id, {
        type: 'typing_indicator',
        userId: user.id || 'local_developer',
        username: user.username,
        channelId: channel.id,
        isTyping,
        timestamp: new Date().toISOString()
      });

      // No need to send a response to the user
    } catch (error) {
      console.error('Error handling typing indicator:', error);
      // Don't respond with error to avoid cluttering the client
    }
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
    try {
      // Support both payload wrapped and direct format
      const channelIdOrName = readData.channelId || (readData.payload && readData.payload.channelId) || 'general';
      const lastReadMessageId = readData.lastReadMessageId || (readData.payload && readData.payload.lastReadMessageId);
      const broadcast = readData.broadcast !== undefined ? readData.broadcast :
                        (readData.payload && readData.payload.broadcast !== undefined ? readData.payload.broadcast : false);

      if (!lastReadMessageId) {
        throw new Error('Last read message ID is required');
      }
      
      // Check if user is a Local Developer (local testing)
      const isLocalDeveloper = this.isLocalDeveloper(user);
      
      // Get channel by ID or name
      const channel = await ChannelModel.getByIdOrName(channelIdOrName);
      
      if (!channel) {
        throw new Error(`Channel not found: ${channelIdOrName}`);
      }
      
      // Check if user is a member of the channel
      const isMember = isLocalDeveloper || await ChannelModel.isMember(channel.id, user.id);
      
      if (!isMember) {
        throw new Error('Not a member of this channel');
      }

      // Update last read timestamp for user in channel if method exists
      if (!isLocalDeveloper && typeof ChannelModel.updateLastRead === 'function') {
        await ChannelModel.updateLastRead(channel.id, user.id, lastReadMessageId);
      }

      // Broadcast read receipt to channel (optional, depending on privacy requirements)
      if (broadcast) {
        await broadcaster.broadcastToChannel(channel.id, {
          type: 'read_receipt',
          userId: user.id || 'local_developer',
          username: user.username,
          channelId: channel.id,
          lastReadMessageId,
          timestamp: new Date().toISOString()
        });
      }

      // Acknowledge receipt
      this.sendResponse(ws, {
        ...responseBase,
        type: 'read_receipt_ack',
        channelId: channel.id,
        lastReadMessageId
      });
    } catch (error) {
      // Send error response
      this.sendResponse(ws, {
        ...responseBase,
        type: 'error',
        error: 'Failed to process read receipt: ' + error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send response to client
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} data - Response data
   */
  static sendResponse(ws, data) {
    if (ws.readyState === ws.OPEN) {
      try {
        const jsonMessage = JSON.stringify(data);
        ws.send(jsonMessage);
      } catch (error) {
        console.error('Error sending response:', error);
      }
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