const UserModel = require('../models/userModel');
const ChannelModel = require('../models/channelModel');
const AuditModel = require('../models/auditModel');
const NotificationPreferenceModel = require('../models/notificationPreferenceModel'); // Import preference model
const config = require('../config');
const logger = require('../config/logger'); // Import logger

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
        logger.warn('No broadcaster provided to NotificationService.sendNotification - cannot send real-time message.');
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
          logger.error({ err: logError, userId: user.id, notificationId: payload.id }, 'Error logging notification');
          
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
      logger.error({ err: error, recipients }, 'Notification dispatch error');
      
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
      logger.error({ err: error, channelId, senderId }, 'Channel notification error');
      
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
   * @returns {Promise<void>}
   */
  static async notifyNewMessage(messageData, broadcaster) {
    const senderId = messageData.senderId;
    const isDM = !!messageData.recipientId;
    const contextId = isDM ? messageData.recipientId : messageData.channelId; // For DM, contextId is the *other* user
    const contextType = isDM ? 'dm' : 'channel';

    if (!contextId) {
        logger.error({ messageData }, 'Cannot notify for message: Missing channelId or recipientId');
        return;
    }

    let potentialRecipientIds = [];
    try {
        if (isDM) {
            // For DMs, only the recipient needs checking (and sender is excluded later)
            potentialRecipientIds = [messageData.recipientId];
        } else {
            // For channels, get all members
            const members = await ChannelModel.getMembers(messageData.channelId);
            potentialRecipientIds = members.map(m => m.id);
        }
    } catch (error) {
        logger.error({ err: error, messageData }, 'Failed to get potential recipients for notification');
        return; // Cannot proceed without recipients
    }

    // Exclude the sender from notifications
    const finalRecipientIds = potentialRecipientIds.filter(id => id !== senderId);

    if (finalRecipientIds.length === 0) {
        logger.debug({ messageData }, 'No recipients to notify for message (excluding sender)');
        return; // No one else to notify
    }

    // 2. Check for mentions
    // TODO: Fix extractMentionedUsers to return IDs based on usernames
    const mentionedUserIds = await this.getMentionedUserIds(messageData.text); // Assume async lookup

    // 3. Fetch preferences and filter recipients
    const notificationsToSend = []; // Array of { userId, notificationPayload }

    for (const recipientId of finalRecipientIds) {
        try {
            // Determine effective preference level (Specific > Global)
            let level = 'all'; // Default if no preference set
            const globalPref = await NotificationPreferenceModel.getSpecificPreference(recipientId, 'global', null);
            const contextPref = await NotificationPreferenceModel.getSpecificPreference(recipientId, contextType, contextId);

            if (contextPref) {
                level = contextPref.notification_level;
            } else if (globalPref) {
                level = globalPref.notification_level;
            }

            // Decide whether to notify
            const isMentioned = mentionedUserIds.includes(recipientId);
            let shouldNotify = false;

            if (level === 'all') {
                shouldNotify = true;
            } else if (level === 'mentions' && isMentioned) {
                shouldNotify = true;
            }
            // If level is 'none', shouldNotify remains false

            if (shouldNotify) {
                // Prepare notification payload for this user
                const notificationPayload = {
                    type: isMentioned ? 'mention' : 'new_message', // Use specific type
                    messageId: messageData.id,
                    channelId: messageData.channelId, // Include channelId even for DMs for context
                    senderId: senderId,
                    senderUsername: messageData.senderUsername, // Assuming this is available
                    textPreview: messageData.text.substring(0, 100), // Short preview
                    isDM: isDM,
                    timestamp: messageData.timestamp,
                    priority: isMentioned ? 'high' : 'normal'
                };
                notificationsToSend.push({ userId: recipientId, payload: notificationPayload });
            }

        } catch (prefError) {
            logger.error({ err: prefError, recipientId, messageId: messageData.id }, 'Error checking notification preference for user');
            // Decide if we should notify anyway on error? Maybe default to 'all'? For now, skip user on error.
        }
    }

    // 4. Send notifications via broadcaster
    if (notificationsToSend.length > 0 && broadcaster) {
        logger.debug({ count: notificationsToSend.length, messageId: messageData.id }, 'Sending filtered notifications');
        // Group notifications by payload (if needed) or send individually
        // For simplicity, sending individually here, but batching might be better
        for (const { userId, payload } of notificationsToSend) {
            try {
                 await broadcaster.broadcastToUsers([userId], { type: 'notification', data: payload });
                 // Log individual notification sent audit event? Maybe too noisy.
            } catch (sendError) {
                 logger.error({ err: sendError, userId, payload }, 'Error sending notification to user');
            }
        }
         // Log overall action
         await AuditModel.log({
            userId: senderId, // Action performed by sender
            action: 'message_notification_processed',
            details: {
                messageId: messageData.id,
                channelId: messageData.channelId,
                recipientId: messageData.recipientId,
                notifiedCount: notificationsToSend.length,
                potentialCount: finalRecipientIds.length
            }
        });
    } else if (notificationsToSend.length === 0) {
         logger.debug({ messageId: messageData.id }, 'No users to notify based on preferences/mentions');
    }
    // Note: We are no longer calling broadcaster.broadcastNewMessage directly here.
    // The broadcaster should only send the actual message, not handle notification logic.
    // The actual message broadcast should happen elsewhere (e.g., in handlers.js after saving).
  }

  /**
   * Extract mentioned user IDs from message text.
   * Placeholder - needs implementation to look up usernames.
   * @param {string} text - Message text
   * @returns {Promise<string[]>} Array of mentioned user IDs
   */
  static async getMentionedUserIds(text) {
    const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
    const usernames = (text.match(mentionRegex) || []).map(match => match.substring(1));

    if (usernames.length === 0) {
        return [];
    }

    try {
        // This requires UserModel to have a method like findByUsernames
        // const users = await UserModel.findByUsernames(usernames);
        // return users.map(u => u.id);
        logger.warn({ usernames }, 'Mention lookup not fully implemented. Returning empty array.');
        return []; // Placeholder
    } catch (error) {
        logger.error({ err: error, usernames }, 'Error looking up mentioned users');
        return [];
    }
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
      logger.error({ err: error, userId }, 'Notification preference update error');
      
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
      logger.error({ err: error, eventType, recipients }, 'System notification error');
      
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