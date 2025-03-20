const ChannelModel = require('../models/channelModel');
const AuditModel = require('../models/auditModel');
const config = require('.../config');
const port = config.port;

class WebSocketBroadcaster {
  /**
   * Initialize broadcaster with WebSocket server
   * @param {Object} wss - WebSocket server instance
   */
  constructor(wss) {
    this.wss = wss;
    // Active WebSocket connections
    this.connections = new Map();
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

      // Log channel join
      await AuditModel.log({
        userId: connectionData.user.id,
        action: 'websocket_channel_join',
        details: { channelId }
      });
    }
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

      // Log channel leave
      await AuditModel.log({
        userId: connectionData.user.id,
        action: 'websocket_channel_leave',
        details: { channelId }
      });
    }
  }

  /**
   * Broadcast message to a specific channel
   * @param {string} channelId - Channel to broadcast to
   * @param {Object} message - Message payload
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcastToChannel(channelId, message) {
    try {
      // Verify channel exists
      const channel = await ChannelModel.getById(channelId);
      
      if (!channel) {
        throw new Error('Channel not found');
      }

      // Get channel members
      const members = await ChannelModel.getMembers(channelId);

      // Track broadcast results
      const broadcastResults = {
        total: 0,
        sent: 0,
        failed: 0
      };

      // Broadcast to connected users in the channel
      this.connections.forEach((connectionData, ws) => {
        // Check if user is in the channel
        if (members.some(member => member.id === connectionData.user.id)) {
          broadcastResults.total++;

          try {
            ws.send(JSON.stringify(message));
            broadcastResults.sent++;
          } catch (error) {
            broadcastResults.failed++;
            console.error('Broadcast error:', error);
          }
        }
      });

      // Log broadcast
      await AuditModel.log({
        action: 'channel_broadcast',
        details: {
          channelId,
          totalRecipients: broadcastResults.total,
          sentMessages: broadcastResults.sent,
          failedMessages: broadcastResults.failed
        }
      });

      return broadcastResults;
    } catch (error) {
      console.error('Channel broadcast error:', error);
      
      await AuditModel.log({
        action: 'channel_broadcast_failed',
        details: { 
          channelId,
          error: error.message 
        }
      });

      throw error;
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

      // Broadcast to specified users
      this.connections.forEach((connectionData, ws) => {
        if (userIds.includes(connectionData.user.id)) {
          try {
            ws.send(JSON.stringify(message));
            broadcastResults.sent++;
          } catch (error) {
            broadcastResults.failed++;
            console.error('User broadcast error:', error);
          }
        }
      });

      // Log broadcast
      await AuditModel.log({
        action: 'user_broadcast',
        details: {
          recipients: userIds,
          totalRecipients: broadcastResults.total,
          sentMessages: broadcastResults.sent,
          failedMessages: broadcastResults.failed
        }
      });

      return broadcastResults;
    } catch (error) {
      console.error('User broadcast error:', error);
      
      await AuditModel.log({
        action: 'user_broadcast_failed',
        details: { 
          recipients: userIds,
          error: error.message 
        }
      });

      throw error;
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
        sent: 0,
        failed: 0
      };

      // Broadcast to all connected users
      this.connections.forEach((connectionData, ws) => {
        try {
          ws.send(JSON.stringify(message));
          broadcastResults.sent++;
        } catch (error) {
          broadcastResults.failed++;
          console.error('System broadcast error:', error);
        }
      });

      // Log system broadcast
      await AuditModel.log({
        action: 'system_broadcast',
        details: {
          totalRecipients: broadcastResults.total,
          sentMessages: broadcastResults.sent,
          failedMessages: broadcastResults.failed
        }
      });

      return broadcastResults;
    } catch (error) {
      console.error('System broadcast error:', error);
      
      await AuditModel.log({
        action: 'system_broadcast_failed',
        details: { error: error.message }
      });

      throw error;
    }
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