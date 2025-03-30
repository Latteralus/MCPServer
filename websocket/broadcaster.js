const ChannelModel = require('../models/channelModel');
const AuditModel = require('../models/auditModel');
const config = require('../config');
const logger = require('../config/logger');

class WebSocketBroadcaster {
  /**
   * Initialize broadcaster with WebSocket server
   * @param {Object} wss - WebSocket server instance
   */
  constructor(wss) {
    this.wss = wss;
    // Active WebSocket connections
    this.connections = new Map();
    // In-memory cache of channel memberships for faster broadcasting
    this.channelMembers = new Map();
  }

  /**
   * Register a new WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} user - Authenticated user
   */
  registerConnection(ws, user) {
    this.connections.set(ws, {
      user,
      channels: new Set(),
      connectedAt: new Date()
    });

    // Log the new WebSocket connection
    AuditModel.log({
      userId: user.id,
      action: 'websocket_connect',
      details: { connectionMethod: 'local_network' }
    }).catch(err => {
      logger.error({ err, userId: user.id }, 'Failed to log connection');
      // Non-critical error, continue
    });
  }

  /**
   * Remove a disconnected WebSocket connection
   * @param {WebSocket} ws - Disconnected WebSocket
   */
  removeConnection(ws) {
    const connectionData = this.connections.get(ws);
    
    if (connectionData) {
      // Log disconnection
      AuditModel.log({
        userId: connectionData.user.id,
        action: 'websocket_disconnect',
        details: { duration: (new Date() - connectionData.connectedAt) / 1000 }
      }).catch(err => {
        logger.error({ err, userId: connectionData.user.id }, 'Failed to log disconnection');
        // Non-critical error, continue
      });

      // Remove from connections
      this.connections.delete(ws);
    }
  }

  /**
   * Join a user to a channel
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} channelId - Channel to join
   * @returns {Promise<boolean>} Whether the join was successful
   */
  async joinChannel(ws, channelId) {
    const connectionData = this.connections.get(ws);
    
    if (connectionData) {
      connectionData.channels.add(channelId);

      try {
        // Ensure the user is a member of the channel in the database
        const isMember = await ChannelModel.isMember(channelId, connectionData.user.id);
        
        if (!isMember) {
          // If not, add them as a member in the DB
          await ChannelModel.addMember(channelId, connectionData.user.id);
        }

        // Update in-memory channel member cache
        if (!this.channelMembers.has(channelId)) {
          this.channelMembers.set(channelId, new Set());
        }
        this.channelMembers.get(channelId).add(connectionData.user.id);

        // Log channel join
        await AuditModel.log({
          userId: connectionData.user.id,
          action: 'websocket_channel_join',
          details: { channelId }
        });
        
        return true;
      } catch (error) {
        logger.error({ err: error, channelId, userId: connectionData?.user?.id }, `Failed to process channel join`);
        
        // Even if DB operations fail, update local membership to avoid partial state
        if (!this.channelMembers.has(channelId)) {
          this.channelMembers.set(channelId, new Set());
        }
        this.channelMembers.get(channelId).add(connectionData.user.id);
        
        return false;
      }
    }
    
    return false;
  }

  /**
   * Leave a channel
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} channelId - Channel to leave
   * @returns {Promise<boolean>} Whether the leave was successful
   */
  async leaveChannel(ws, channelId) {
    const connectionData = this.connections.get(ws);
    
    if (connectionData) {
      connectionData.channels.delete(channelId);

      try {
        // Update in-memory channel member cache
        if (this.channelMembers.has(channelId)) {
          this.channelMembers.get(channelId).delete(connectionData.user.id);
        }

        // Log channel leave
        await AuditModel.log({
          userId: connectionData.user.id,
          action: 'websocket_channel_leave',
          details: { channelId }
        });
        
        return true;
      } catch (error) {
        logger.error({ err: error, channelId, userId: connectionData?.user?.id }, `Failed to process channel leave`);

        // Update local membership even if logging fails
        if (this.channelMembers.has(channelId)) {
          this.channelMembers.get(channelId).delete(connectionData.user.id);
        }
        
        return false;
      }
    }
    
    return false;
  }

  /**
   * Broadcast message to a specific channel.
   * Includes permission checks to ensure only an authorized user can broadcast.
   * 
   * @param {string} channelId - Channel to broadcast to
   * @param {Object} message - Message payload
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastToChannel(channelId, message) {
    // ---------------------------
    // PERMISSION CHECK (NEW)
    // ---------------------------
    const senderId = message.data?.senderId;
    if (senderId) {
      const hasPermission = await ChannelModel.isMember(channelId, senderId);
      if (!hasPermission) {
        logger.error({ channelId, userId: senderId }, `Unauthorized broadcast attempt to channel`);
        await AuditModel.log({
          userId: senderId,
          action: 'unauthorized_broadcast_attempt',
          details: { channelId }
        });
        return { total: 0, sent: 0, failed: 0, error: 'Unauthorized' };
      }
    }

    try {
      // Track broadcast results
      const broadcastResults = { total: 0, sent: 0, failed: 0 };

      // Try to get channel members from in-memory cache
      let memberUserIds = [];
      if (this.channelMembers.has(channelId)) {
        memberUserIds = Array.from(this.channelMembers.get(channelId));
      }

      // If not found in cache, fetch from DB and update cache
      if (memberUserIds.length === 0) {
        try {
          const channel = await ChannelModel.getById(channelId);
          if (!channel) {
            throw new Error('Channel not found');
          }

          const members = await ChannelModel.getMembers(channelId);
          memberUserIds = members.map(member => member.id);

          this.channelMembers.set(channelId, new Set(memberUserIds));
        } catch (dbError) {
          logger.error({ err: dbError, channelId }, `Error fetching channel data`);
          // If DB fetch fails, fallback to in-memory sets in connections
        }
      }

      // Identify which connections should receive this message
      const receiversByUserId = new Map();
      this.connections.forEach((connectionData, ws) => {
        // A user should receive the message if:
        // 1. They are in the channel's member list, or
        // 2. They have the channel in their connection's channels set
        const userIsChannelMember = memberUserIds.includes(connectionData.user.id);
        const connectionHasChannel = connectionData.channels.has(channelId);

        if (userIsChannelMember || connectionHasChannel) {
          if (!receiversByUserId.has(connectionData.user.id)) {
            receiversByUserId.set(connectionData.user.id, []);
          }
          receiversByUserId.get(connectionData.user.id).push(ws);
        }
      });

      // Count total recipients
      broadcastResults.total = receiversByUserId.size;

      // Send to each user (selecting the first connection if multiple)
      receiversByUserId.forEach((connections, userId) => {
        if (connections.length > 0) {
          const ws = connections[0]; // use the first open connection
          try {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify(message));
              broadcastResults.sent++;
            } else {
              broadcastResults.failed++;
            }
          } catch (error) {
            broadcastResults.failed++;
            logger.error({ err: error, userId, channelId }, 'Broadcast error to user in channel');
          }
        }
      });

      // Log broadcast only if we have actual recipients
      if (broadcastResults.total > 0) {
        try {
          await AuditModel.log({
            action: 'channel_broadcast',
            details: {
              channelId,
              totalRecipients: broadcastResults.total,
              sentMessages: broadcastResults.sent,
              failedMessages: broadcastResults.failed
            }
          });
        } catch (logError) {
          logger.error({ err: logError, channelId }, 'Failed to log channel broadcast');
        }
      }

      return broadcastResults;
    } catch (error) {
      logger.error({ err: error, channelId }, 'Channel broadcast error');

      try {
        await AuditModel.log({
          action: 'channel_broadcast_failed',
          details: { channelId, error: error.message }
        });
      } catch (logError) {
        logger.error({ err: logError, channelId }, 'Failed to log channel broadcast failure');
      }

      return { total: 0, sent: 0, failed: 0, error: error.message };
    }
  }

  /**
   * Broadcast to specific users
   * @param {string[]} userIds - Array of user IDs
   * @param {Object} message - Message payload
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastToUsers(userIds, message) {
    try {
      const broadcastResults = { total: userIds.length, sent: 0, failed: 0 };

      // Find all connections for these user IDs
      const userConnections = new Map();
      this.connections.forEach((connectionData, ws) => {
        if (userIds.includes(connectionData.user.id)) {
          if (!userConnections.has(connectionData.user.id)) {
            userConnections.set(connectionData.user.id, []);
          }
          userConnections.get(connectionData.user.id).push(ws);
        }
      });

      // Send to each user (via the first available connection)
      userConnections.forEach((connections, userId) => {
        if (connections.length > 0) {
          const ws = connections[0];
          try {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify(message));
              broadcastResults.sent++;
            } else {
              broadcastResults.failed++;
            }
          } catch (error) {
            broadcastResults.failed++;
            logger.error({ err: error, userId }, 'User broadcast error');
          }
        } else {
          broadcastResults.failed++;
        }
      });

      // Log broadcast
      try {
        await AuditModel.log({
          action: 'user_broadcast',
          details: {
            recipients: userIds,
            totalRecipients: broadcastResults.total,
            sentMessages: broadcastResults.sent,
            failedMessages: broadcastResults.failed
          }
        });
      } catch (logError) {
        logger.error({ err: logError, recipients: userIds }, 'Failed to log user broadcast');
      }

      return broadcastResults;
    } catch (error) {
      logger.error({ err: error, recipients: userIds }, 'User broadcast error');

      try {
        await AuditModel.log({
          action: 'user_broadcast_failed',
          details: {
            recipients: userIds,
            error: error.message
          }
        });
      } catch (logError) {
        logger.error({ err: logError, recipients: userIds }, 'Failed to log user broadcast failure');
      }

      return {
        total: userIds.length,
        sent: 0,
        failed: userIds.length,
        error: error.message
      };
    }
  }

  /**
   * Send system-wide broadcast
   * @param {Object} message - Message payload
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastSystemMessage(message) {
    try {
      const broadcastResults = {
        total: this.connections.size,
        sent: 0,
        failed: 0
      };

      // Broadcast to all connections
      this.connections.forEach((connectionData, ws) => {
        try {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(message));
            broadcastResults.sent++;
          } else {
            broadcastResults.failed++;
          }
        } catch (error) {
          broadcastResults.failed++;
          logger.error({ err: error }, 'System broadcast error to specific connection');
        }
      });

      // Log system broadcast
      try {
        await AuditModel.log({
          action: 'system_broadcast',
          details: {
            totalRecipients: broadcastResults.total,
            sentMessages: broadcastResults.sent,
            failedMessages: broadcastResults.failed
          }
        });
      } catch (logError) {
        logger.error({ err: logError }, 'Failed to log system broadcast');
      }

      return broadcastResults;
    } catch (error) {
      logger.error({ err: error }, 'System broadcast error');

      try {
        await AuditModel.log({
          action: 'system_broadcast_failed',
          details: { error: error.message }
        });
      } catch (logError) {
        logger.error({ err: logError }, 'Failed to log system broadcast failure');
      }

      return {
        total: this.connections.size,
        sent: 0,
        failed: this.connections.size,
        error: error.message
      };
    }
  }

  /**
   * Broadcast a newly created message to its channel
   * @param {Object} messageData - Message data (including channelId)
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastNewMessage(messageData) {
    const broadcastMessage = {
      type: 'new_message',
      data: messageData,
      timestamp: new Date().toISOString()
    };

    return this.broadcastToChannel(messageData.channelId, broadcastMessage);
  }

  /**
   * Broadcast a message update to its channel
   * @param {Object} messageData - Updated message data (including channelId)
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastMessageUpdate(messageData) {
    const broadcastMessage = {
      type: 'message_updated',
      data: messageData,
      timestamp: new Date().toISOString()
    };

    return this.broadcastToChannel(messageData.channelId, broadcastMessage);
  }

  /**
   * Broadcast a message deletion to its channel
   * @param {string} messageId - ID of deleted message
   * @param {string} channelId - Channel ID
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastMessageDeletion(messageId, channelId) {
    const broadcastMessage = {
      type: 'message_deleted',
      data: {
        messageId,
        channelId
      },
      timestamp: new Date().toISOString()
    };

    return this.broadcastToChannel(channelId, broadcastMessage);
  }

  /**
   * Broadcast channel member join notification
   * @param {string} channelId - Channel ID
   * @param {Object} userData - User who joined (id, username, etc.)
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastMemberJoin(channelId, userData) {
    const broadcastMessage = {
      type: 'member_joined',
      data: {
        channelId,
        user: {
          id: userData.id,
          username: userData.username
        }
      },
      timestamp: new Date().toISOString()
    };

    return this.broadcastToChannel(channelId, broadcastMessage);
  }

  /**
   * Broadcast channel member leave notification
   * @param {string} channelId - Channel ID
   * @param {Object} userData - User who left (id, username, etc.)
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastMemberLeave(channelId, userData) {
    const broadcastMessage = {
      type: 'member_left',
      data: {
        channelId,
        user: {
          id: userData.id,
          username: userData.username
        }
      },
      timestamp: new Date().toISOString()
    };

    return this.broadcastToChannel(channelId, broadcastMessage);
  }

  /**
   * Get active connections statistics
   * @returns {Object} Connection statistics
   */
  getConnectionStats() {
    return {
      totalConnections: this.connections.size,
      connectedUsers: Array.from(this.connections.values()).map(conn => ({
        userId: conn.user.id,
        username: conn.user.username,
        channels: Array.from(conn.channels),
        connectedAt: conn.connectedAt
      }))
    };
  }
}

module.exports = WebSocketBroadcaster;
