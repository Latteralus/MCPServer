const MessageModel = require('../models/messageModel');
const ChannelModel = require('../models/channelModel');
const PermissionService = require('./permissionService');
const AuditModel = require('../models/auditModel');
const config = require('../config');
const logger = require('../config/logger'); // Import logger
const port = config.port;

class MessageService {
  /**
   * Send a message in a channel
   * @param {Object} messageData - Message details
   * @param {string} senderId - ID of message sender
   * @returns {Promise<Object>} Sent message
   */
  static async sendMessage(messageData, senderId) {
    try {
      // Validate sender's permissions
      await PermissionService.authorizeAction(
        senderId, 
        'message.create', 
        async () => {
          const { channelId } = messageData;

          // Check if sender is a member of the channel
          const isMember = await ChannelModel.isMember(channelId, senderId);
          
          if (!isMember) {
            throw new Error('Not a member of this channel');
          }

          // Set sender ID
          messageData.senderId = senderId;

          // Create message
          const message = await MessageModel.create(messageData);

          // Update channel's last activity
          await ChannelModel.updateLastActivity(channelId);

          // Log message creation
          await AuditModel.log({
            userId: senderId,
            action: 'message_sent',
            details: { 
              channelId, 
              messageId: message.id,
              containsPHI: message.containsPHI 
            }
          });

          return message;
        }
      );
    } catch (error) {
      logger.error({ err: error, messageData, senderId }, 'Send message error');
      
      await AuditModel.log({
        userId: senderId,
        action: 'message_send_failed',
        details: { 
          channelId: messageData.channelId,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Get message details
   * @param {string} messageId - Message ID
   * @param {string} requesterId - ID of user requesting message
   * @returns {Promise<Object>} Message details
   */
  static async getMessage(messageId, requesterId) {
    try {
      // Fetch message details
      const message = await MessageModel.getById(messageId, requesterId);

      if (!message) {
        throw new Error('Message not found');
      }

      // Validate reader's access
      const isMember = await ChannelModel.isMember(message.channelId, requesterId);
      
      if (!isMember) {
        // Check if user has read permission
        const hasReadPermission = await PermissionService.hasPermission(
          requesterId, 
          'message.read'
        );

        if (!hasReadPermission) {
          throw new Error('Not authorized to read this message');
        }
      }

      // Log message access
      await AuditModel.log({
        userId: requesterId,
        action: 'message_accessed',
        details: { 
          messageId, 
          channelId: message.channelId 
        }
      });

      return message;
    } catch (error) {
      logger.error({ err: error, messageId, requesterId }, 'Get message error');
      
      await AuditModel.log({
        userId: requesterId,
        action: 'message_access_failed',
        details: { 
          messageId,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Update a message
   * @param {string} messageId - Message ID
   * @param {Object} updateData - Message update details
   * @param {string} editorId - ID of user editing the message
   * @returns {Promise<Object>} Updated message
   */
  static async updateMessage(messageId, updateData, editorId) {
    try {
      // Validate editor's permissions
      await PermissionService.authorizeAction(
        editorId, 
        'message.update', 
        async () => {
          // Update message
          const updatedMessage = await MessageModel.update(
            messageId, 
            editorId, 
            updateData
          );

          // Log message update
          await AuditModel.log({
            userId: editorId,
            action: 'message_updated',
            details: { 
              messageId,
              updates: Object.keys(updateData)
            }
          });

          return updatedMessage;
        }
      );
    } catch (error) {
      logger.error({ err: error, messageId, updateData, editorId }, 'Update message error');
      
      await AuditModel.log({
        userId: editorId,
        action: 'message_update_failed',
        details: { 
          messageId,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Delete a message
   * @param {string} messageId - Message ID
   * @param {string} deleterId - ID of user deleting the message
   * @param {boolean} [permanent=false] - Whether to permanently delete
   * @returns {Promise<Object>} Deletion result
   */
  static async deleteMessage(messageId, deleterId, permanent = false) {
    try {
      // Validate deleter's permissions
      await PermissionService.authorizeAction(
        deleterId, 
        'message.delete', 
        async () => {
          // Delete message
          const deleteResult = await MessageModel.delete(
            messageId, 
            deleterId, 
            permanent
          );

          // Log message deletion
          await AuditModel.log({
            userId: deleterId,
            action: permanent ? 'message_permanently_deleted' : 'message_soft_deleted',
            details: { 
              messageId,
              permanent
            }
          });

          return deleteResult;
        }
      );
    } catch (error) {
      logger.error({ err: error, messageId, deleterId, permanent }, 'Delete message error');
      
      await AuditModel.log({
        userId: deleterId,
        action: 'message_delete_failed',
        details: { 
          messageId,
          permanent,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Search messages
   * @param {Object} searchParams - Search parameters
   * @param {string} searcherId - ID of user performing search
   * @returns {Promise<Object>} Search results
   */
  static async searchMessages(searchParams, searcherId) {
    try {
      // Validate search permissions
      await PermissionService.authorizeAction(
        searcherId, 
        'message.read', 
        async () => {
          // Perform message search
          const results = await MessageModel.search(searchParams);

          // Log message search
          await AuditModel.log({
            userId: searcherId,
            action: 'messages_searched',
            details: { 
              searchParams,
              resultCount: results.length
            }
          });

          return results;
        }
      );
    } catch (error) {
      logger.error({ err: error, searchParams, searcherId }, 'Search messages error');
      
      await AuditModel.log({
        userId: searcherId,
        action: 'message_search_failed',
        details: { 
          searchParams,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Flag a message for review
   * @param {string} messageId - Message ID
   * @param {Object} flagData - Flag details
   * @param {string} flaggerId - ID of user flagging the message
   * @returns {Promise<Object>} Flagged message
   */
  static async flagMessage(messageId, flagData, flaggerId) {
    try {
      // Validate flagger's permissions
      await PermissionService.authorizeAction(
        flaggerId, 
        'message.flag', 
        async () => {
          // Flag the message
          const flaggedMessage = await MessageModel.flag(
            messageId, 
            flaggerId, 
            flagData
          );

          // Log message flagging
          await AuditModel.log({
            userId: flaggerId,
            action: 'message_flagged',
            details: { 
              messageId,
              reason: flagData.reason
            }
          });

          return flaggedMessage;
        }
      );
    } catch (error) {
      logger.error({ err: error, messageId, flagData, flaggerId }, 'Flag message error');
      
      await AuditModel.log({
        userId: flaggerId,
        action: 'message_flag_failed',
        details: { 
          messageId,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Get messages for a specific channel
   * @param {string} channelId - Channel ID
   * @param {string} requesterId - ID of user requesting messages
   * @param {Object} options - Retrieval options
   * @returns {Promise<Object>} Channel messages
   */
  static async getChannelMessages(channelId, requesterId, options = {}) {
    try {
      // Check channel membership or read permissions
      const isMember = await ChannelModel.isMember(channelId, requesterId);
      
      if (!isMember) {
        // Check if user has read permission
        const hasReadPermission = await PermissionService.hasPermission(
          requesterId, 
          'message.read'
        );

        if (!hasReadPermission) {
          throw new Error('Not authorized to read channel messages');
        }
      }

      // Search messages for the channel
      const searchParams = {
        channelId,
        ...options
      };

      const messages = await MessageModel.search(searchParams);

      // Log message retrieval
      await AuditModel.log({
        userId: requesterId,
        action: 'channel_messages_retrieved',
        details: { 
          channelId,
          messageCount: messages.length
        }
      });

      return messages;
    } catch (error) {
      logger.error({ err: error, channelId, requesterId, options }, 'Get channel messages error');
      
      await AuditModel.log({
        userId: requesterId,
        action: 'channel_messages_retrieval_failed',
        details: { 
          channelId,
          error: error.message 
        }
      });

      throw error;
    }
  }
}

module.exports = MessageService;