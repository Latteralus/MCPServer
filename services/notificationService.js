const UserModel = require('../models/userModel');
const ChannelModel = require('../models/channelModel');
const AuditModel = require('../models/auditModel');
const config = require('../config');

class NotificationService {
  /**
   * Send a real-time notification to specific users
   * @param {string|string[]} recipients - User ID(s) to receive notification
   * @param {Object} notificationData - Notification details
   * @param {WebSocketBroadcaster} broadcaster - WebSocket broadcaster instance
   * @returns {Promise<Object>} Notification dispatch result
   */
  static async sendNotification(recipients, notificationData, broadcaster) {
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
      const dispatchResults = {
        total: validUsers.length,
        sent: 0,
        failed: 0,
        details: []
      };

      // Send notification via broadcaster if provided
      if (broadcaster) {
        const broadcastResult = await broadcaster.broadcastToUsers(
          validUsers.map(u => u.id),
          {
            type: 'notification',
            data: payload
          }
        );
        
        dispatchResults.sent = broadcastResult.sent;
        dispatchResults.failed = broadcastResult.failed;
      }
      else {
        // Without broadcaster, just record a log but can't actually send
        dispatchResults.failed = validUsers.length;
        console.warn('No broadcaster provided to NotificationService.sendNotification');
      }

      // Log notification dispatch
      for (const user of validUsers) {
        try {
          await AuditModel.log({
            userId: user.id,
            action: 'notification_sent',
            details: { 
              notificationType: payload.type,
              notificationId: payload.id 
            }
          });
          
          dispatchResults.details.push({
            userId: user.id,
            username: user.username,
            sent: true
          });
        } catch (logError) {
          console.error('Error logging notification:', logError);
          
          dispatchResults.details.push({
            userId: user.id,
            username: user.username,
            sent: false,
            error: logError.message
          });
        }
      }

      return dispatchResults;
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
   * @param {WebSocketBroadcaster} broadcaster - WebSocket broadcaster instance
   * @param {string} [senderId] - Optional ID of user sending notification
   * @returns {Promise<Object>} Notification dispatch result
   */
  static async sendChannelNotification(channelId, notificationData, broadcaster, senderId = null) {
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
        channelName: channel.name,
        type: notificationData.type || 'channel_notification'
      };

      // Send to all channel members
      const result = await this.sendNotification(
        members.map(member => member.id), 
        channelPayload,
        broadcaster
      );

      // Log channel notification
      await AuditModel.log({
        userId: senderId,
        action: 'channel_notification_sent',
        details: { 
          channelId,
          recipients: result.total
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
    return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Notify about new message
   * @param {Object} messageData - Message data
   * @param {WebSocketBroadcaster} broadcaster - WebSocket broadcaster
   * @returns {Promise<Object>} Notification result
   */
  static async notifyNewMessage(messageData, broadcaster) {
    // Get mentioned users (if any)
    const mentionedUserIds = this.extractMentionedUsers(messageData.text);
    
    // If there are mentions, send direct notifications
    if (mentionedUserIds.length > 0) {
      try {
        await this.sendNotification(
          mentionedUserIds,
          {
            type: 'mention',
            messageId: messageData.id,
            channelId: messageData.channelId,
            senderId: messageData.senderId,
            text: messageData.text,
            priority: 'high'
          },
          broadcaster
        );
      } catch (mentionError) {
        console.error('Error sending mention notifications:', mentionError);
      }
    }
    
    // Return normal channel broadcast result
    return broadcaster.broadcastNewMessage(messageData);
  }

  /**
   * Extract mentioned users from message text
   * @param {string} text - Message text
   * @returns {string[]} Array of mentioned user IDs
   */
  static extractMentionedUsers(text) {
    // Extract @mentions from text
    const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
    const mentionMatches = text.match(mentionRegex) || [];
    
    // Get usernames without @ symbol
    const mentionedUsernames = mentionMatches.map(match => match.substring(1));
    
    // This would normally query the database
    // For now we'll just return a placeholder since the actual implementation
    // would depend on your user model specifics
    return []; // Placeholder - would return actual user IDs in production 
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

  /**
   * Notify about system events
   * @param {string} eventType - Type of system event
   * @param {Object} eventData - Event details
   * @param {WebSocketBroadcaster} broadcaster - WebSocket broadcaster
   * @param {string[]} [recipients] - Optional specific recipients
   * @returns {Promise<Object>} Notification result
   */
  static async notifySystemEvent(eventType, eventData, broadcaster, recipients = null) {
    // Format system message
    const systemMessage = {
      type: 'system_event',
      eventType,
      data: eventData,
      timestamp: new Date().toISOString()
    };
    
    try {
      // If specific recipients are specified
      if (recipients && recipients.length > 0) {
        return await this.sendNotification(
          recipients,
          systemMessage,
          broadcaster
        );
      }
      
      // Otherwise broadcast system-wide
      return await broadcaster.broadcastSystemMessage(systemMessage);
    } catch (error) {
      console.error('System notification error:', error);
      
      await AuditModel.log({
        action: 'system_notification_failed',
        details: { 
          eventType,
          error: error.message 
        }
      });
      
      throw error;
    }
  }
}

module.exports = NotificationService;