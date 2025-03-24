const ChannelModel = require('../models/channelModel');
const AuditModel = require('../models/auditModel');
const config = require('../config');

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

    // Log connection
    AuditModel.log({
      userId: user.id,
      action: 'websocket_connect',
      details: { connectionMethod: 'local_network' }
    }).catch(err => {
      console.error('Failed to log connection:', err);
      // Non-critical error, continue anyway
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
        details: { 
          duration: (new Date() - connectionData.connectedAt) / 1000 
        }
      }).catch(err => {
        console.error('Failed to log disconnection:', err);
        // Non-critical error, continue anyway
      });

      // Remove from connections
      this.connections.delete(ws);
    }
  }

  /**
   * Join a user to a channel
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} channelId - Channel to join
   */
  async joinChannel(ws, channelId) {
    const connectionData = this.connections.get(ws);
    
    if (connectionData) {
      connectionData.channels.add(channelId);

      try {
        // Check if the user is actually a member of this channel in database
        const isMember = await ChannelModel.isMember(channelId, connectionData.user.id);
        
        if (!isMember) {
          // Add them as a member in the database
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
        console.error(`Failed to process channel join for ${channelId}:`, error);
        
        // Even if database operations fail, still add channel to connection data
        // This ensures the user can still receive messages in local-only mode
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
        console.error(`Failed to process channel leave for ${channelId}:`, error);
        
        // Still update in-memory cache even if logging fails
        if (this.channelMembers.has(channelId)) {
          this.channelMembers.get(channelId).delete(connectionData.user.id);
        }
        
        return false;
      }
    }
    
    return false;
  }

  /**
   * Broadcast message to a specific channel
   * @param {string} channelId - Channel to broadcast to
   * @param {Object} message - Message payload
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastToChannel(channelId, message) {
    try {
      // Track broadcast results
      const broadcastResults = {
        total: 0,
        sent: 0,
        failed: 0
      };

      // First try to get channel members from in-memory cache
      let memberUserIds = [];
      if (this.channelMembers.has(channelId)) {
        memberUserIds = Array.from(this.channelMembers.get(channelId));
      }

      // If not in cache, try to get from database
      if (memberUserIds.length === 0) {
        try {
          // Verify channel exists
          const channel = await ChannelModel.getById(channelId);
          
          if (!channel) {
            throw new Error('Channel not found');
          }

          // Get channel members
          const members = await ChannelModel.getMembers(channelId);
          memberUserIds = members.map(member => member.id);

          // Update cache for future use
          this.channelMembers.set(channelId, new Set(memberUserIds));
        } catch (dbError) {
          console.error(`Error fetching channel data for ${channelId}:`, dbError);
          // Continue with broadcasting to connections that have this channel in their set
          // This allows for a graceful fallback if the database is unavailable
        }
      }

      // Find all connections that should receive this message
      const receiversByUserId = new Map();

      // First collect connections by user ID to avoid duplicates
      this.connections.forEach((connectionData, ws) => {
        // A user should receive the message if:
        // 1. They are in the channel's member list from DB, OR
        // 2. They have this channel in their connection's channels set
        const userIsChannelMember = memberUserIds.includes(connectionData.user.id);
        const connectionHasChannel = connectionData.channels.has(channelId);

        if (userIsChannelMember || connectionHasChannel) {
          // Store the connection for this user
          if (!receiversByUserId.has(connectionData.user.id)) {
            receiversByUserId.set(connectionData.user.id, []);
          }
          receiversByUserId.get(connectionData.user.id).push(ws);
        }
      });

      // Count total recipients
      broadcastResults.total = receiversByUserId.size;

      // Send to each unique user (using their first connection if they have multiple)
      receiversByUserId.forEach((connections, userId) => {
        if (connections.length > 0) {
          const ws = connections[0]; // Use first connection
          
          try {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify(message));
              broadcastResults.sent++;
            } else {
              broadcastResults.failed++;
            }
          } catch (error) {
            broadcastResults.failed++;
            console.error('Broadcast error:', error);
          }
        }
      });

      // Log broadcast if members were found
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
          console.error('Failed to log broadcast:', logError);
          // Non-critical error, continue anyway
        }
      }

      return broadcastResults;
    } catch (error) {
      console.error('Channel broadcast error:', error);
      
      try {
        await AuditModel.log({
          action: 'channel_broadcast_failed',
          details: { 
            channelId,
            error: error.message 
          }
        });
      } catch (logError) {
        console.error('Failed to log broadcast failure:', logError);
      }

      return {
        total: 0,
        sent: 0,
        failed: 0,
        error: error.message
      };
    }
  }

  /**
   * Broadcast to specific users
   * @param {string[]} userIds - Users to send message to
   * @param {Object} message - Message payload
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastToUsers(userIds, message) {
    try {
      // Track broadcast results
      const broadcastResults = {
        total: userIds.length,
        sent: 0,
        failed: 0
      };

      // Find all connections for these users
      const userConnections = new Map();
      
      // Group connections by user ID
      this.connections.forEach((connectionData, ws) => {
        if (userIds.includes(connectionData.user.id)) {
          if (!userConnections.has(connectionData.user.id)) {
            userConnections.set(connectionData.user.id, []);
          }
          userConnections.get(connectionData.user.id).push(ws);
        }
      });

      // Send to each user (using their first connection if they have multiple)
      userConnections.forEach((connections, userId) => {
        if (connections.length > 0) {
          const ws = connections[0]; // Use first connection
          
          try {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify(message));
              broadcastResults.sent++;
            } else {
              broadcastResults.failed++;
            }
          } catch (error) {
            broadcastResults.failed++;
            console.error('User broadcast error:', error);
          }
        } else {
          // User is in the target list but has no active connections
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
        console.error('Failed to log user broadcast:', logError);
      }

      return broadcastResults;
    } catch (error) {
      console.error('User broadcast error:', error);
      
      try {
        await AuditModel.log({
          action: 'user_broadcast_failed',
          details: { 
            recipients: userIds,
            error: error.message 
          }
        });
      } catch (logError) {
        console.error('Failed to log broadcast failure:', logError);
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
      // Track broadcast results
      const broadcastResults = {
        total: this.connections.size,
        sent: 0,  // FIXED: This was previously A0, a typo
        failed: 0
      };

      // Broadcast to all connected users
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
          console.error('System broadcast error:', error);
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
        console.error('Failed to log system broadcast:', logError);
      }

      return broadcastResults;
    } catch (error) {
      console.error('System broadcast error:', error);
      
      try {
        await AuditModel.log({
          action: 'system_broadcast_failed',
          details: { error: error.message }
        });
      } catch (logError) {
        console.error('Failed to log broadcast failure:', logError);
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
   * Broadcast a new message to its channel
   * @param {Object} messageData - Message data
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastNewMessage(messageData) {
    // Format the message for broadcast
    const broadcastMessage = {
      type: 'new_message',
      data: messageData,
      timestamp: new Date().toISOString()
    };

    // Broadcast to the channel
    return this.broadcastToChannel(messageData.channelId, broadcastMessage);
  }

  /**
   * Broadcast a message update to its channel
   * @param {Object} messageData - Updated message data
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastMessageUpdate(messageData) {
    // Format the message for broadcast
    const broadcastMessage = {
      type: 'message_updated',
      data: messageData,
      timestamp: new Date().toISOString()
    };

    // Broadcast to the channel
    return this.broadcastToChannel(messageData.channelId, broadcastMessage);
  }

  /**
   * Broadcast a message deletion to its channel
   * @param {string} messageId - ID of deleted message
   * @param {string} channelId - Channel ID
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastMessageDeletion(messageId, channelId) {
    // Format the message for broadcast
    const broadcastMessage = {
      type: 'message_deleted',
      data: {
        messageId,
        channelId
      },
      timestamp: new Date().toISOString()
    };

    // Broadcast to the channel
    return this.broadcastToChannel(channelId, broadcastMessage);
  }

  /**
   * Broadcast channel member join notification
   * @param {string} channelId - Channel ID
   * @param {Object} userData - User who joined
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastMemberJoin(channelId, userData) {
    // Format the message for broadcast
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

    // Broadcast to the channel
    return this.broadcastToChannel(channelId, broadcastMessage);
  }

  /**
   * Broadcast channel member leave notification
   * @param {string} channelId - Channel ID
   * @param {Object} userData - User who left
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastMemberLeave(channelId, userData) {
    // Format the message for broadcast
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

    // Broadcast to the channel
    return this.broadcastToChannel(channelId, broadcastMessage);
  }

  /**
   * Get active connections statistics
   * @returns {Object} Connection statistics
   */
  getConnectionStats() {
    return {
      totalConnections: this.connections.size,
      connectedUsers: Array.from(this.connections.values()).map(
        conn => ({
          userId: conn.user.id,
          username: conn.user.username,
          channels: Array.from(conn.channels),
          connectedAt: conn.connectedAt
        })
      )
    };
  }
}

module.exports = WebSocketBroadcaster;