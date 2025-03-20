const UserModel = require('../models/userModel');
const ChannelModel = require('../models/channelModel');
const AuditModel = require('../models/auditModel');
const config = require('.../config');
const port = config.port;

class NotificationService {
  /**
   * Send a real-time notification to specific users
   * @param {string|string[]} recipients - User ID(s) to receive notification
   * @param {Object} notificationData - Notification details
   * @returns {Promise<Object>} Notification dispatch result
   */
  static async sendNotification(recipients, notificationData) {
    try {
      // Normalize recipients to array
      const recipientIds = Array.isArray(recipients) ? recipients : [recipients];

      // Validate recipients exist
      const validUsers = await UserModel.getUsersByIds(recipientIds);

      if (validUsers.length === 0) {
        throw new Error('No valid recipients found');
      }

      // Prepare notification payload
      const payload = {
        id: this.generateNotificationId(),
        timestamp: new Date().toISOString(),
        ...notificationData
      };

      // Track dispatch results
      const dispatchResults = [];

      // Send notifications to each recipient
      for (const user of validUsers) {
        try {
          // In a local network WebSocket context, we'd use active WebSocket connections
          // This is a placeholder for actual WebSocket dispatch
          const dispatched = await this.dispatchToUser(user.id, payload);
          
          dispatchResults.push({
            userId: user.id,
            username: user.username,
            dispatched
          });

          // Log successful notification
          await AuditModel.log({
            userId: user.id,
            action: 'notification_sent',
            details: { 
              notificationType: payload.type,
              notificationId: payload.id 
            }
          });
        } catch (userDispatchError) {
          // Log individual dispatch failures
          await AuditModel.log({
            userId: user.id,
            action: 'notification_dispatch_failed',
            details: { 
              notificationType: payload.type,
              error: userDispatchError.message 
            }
          });

          dispatchResults.push({
            userId: user.id,
            username: user.username,
            dispatched: false,
            error: userDispatchError.message
          });
        }
      }

      return {
        totalRecipients: recipientIds.length,
        dispatched: dispatchResults.filter(r => r.dispatched).length,
        results: dispatchResults
      };
    } catch (error) {
      console.error('Notification dispatch error:', error);
      
      await AuditModel.log({
        action: 'notification_dispatch_failed',
        details: { 
          recipients,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Send channel-wide notification
   * @param {string} channelId - Channel to notify
   * @param {Object} notificationData - Notification details
   * @param {string} [senderId] - Optional ID of user sending notification
   * @returns {Promise<Object>} Notification dispatch result
   */
  static async sendChannelNotification(channelId, notificationData, senderId = null) {
    try {
      // Verify channel exists
      const channel = await ChannelModel.getById(channelId);
      
      if (!channel) {
        throw new Error('Channel not found');
      }

      // Get channel members
      const members = await ChannelModel.getMembers(channelId);
      
      if (members.length === 0) {
        throw new Error('No channel members to notify');
      }

      // Prepare channel notification
      const channelPayload = {
        ...notificationData,
        channelId,
        type: 'channel_notification'
      };

      // Send to all channel members
      const result = await this.sendNotification(
        members.map(member => member.id), 
        channelPayload
      );

      // Log channel notification
      await AuditModel.log({
        userId: senderId,
        action: 'channel_notification_sent',
        details: { 
          channelId,
          recipients: result.totalRecipients 
        }
      });

      return result;
    } catch (error) {
      console.error('Channel notification error:', error);
      
      await AuditModel.log({
        userId: senderId,
        action: 'channel_notification_failed',
        details: { 
          channelId,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Generate unique notification ID
   * @returns {string} Unique notification identifier
   */
  static generateNotificationId() {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Dispatch notification to a specific user
   * This is a placeholder method that would be implemented 
   * using the actual WebSocket dispatch mechanism
   * @param {string} userId - User to receive notification
   * @param {Object} payload - Notification payload
   * @returns {Promise<boolean>} Dispatch success
   */
  static async dispatchToUser(userId, payload) {
    // In a real implementation, this would use active WebSocket connections
    // For local network, this might involve checking active sessions and dispatching
    console.log(`Dispatching notification to user ${userId}:`, payload);
    return true;
  }

  /**
   * Create user preferences for notifications
   * @param {string} userId - User setting preferences
   * @param {Object} preferences - Notification preferences
   * @returns {Promise<Object>} Updated user preferences
   */
  static async setNotificationPreferences(userId, preferences) {
    try {
      // Update user's notification preferences
      const updatedUser = await UserModel.updateNotificationPreferences(
        userId, 
        preferences
      );

      // Log preference update
      await AuditModel.log({
        userId,
        action: 'notification_preferences_updated',
        details: { preferences }
      });

      return updatedUser;
    } catch (error) {
      console.error('Notification preference update error:', error);
      
      await AuditModel.log({
        userId,
        action: 'notification_preferences_update_failed',
        details: { 
          error: error.message 
        }
      });

      throw error;
    }
  }
}

module.exports = NotificationService;