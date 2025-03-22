const ChannelModel = require('../models/channelModel');
const UserModel = require('../models/userModel');
const MessageModel = require('../models/messageModel');
const PermissionService = require('./permissionService');
const AuditModel = require('../models/auditModel');
const config = require('../config');
const port = config.port;

class ChannelService {
  /**
   * Create a new channel
   * @param {Object} channelData - Channel creation details
   * @param {string} creatorId - ID of user creating the channel
   * @returns {Promise<Object>} Created channel
   */
  static async createChannel(channelData, creatorId) {
    try {
      // Validate creator has permission to create channels
      await PermissionService.authorizeAction(
        creatorId, 
        'channel.create', 
        async () => {
          // Create channel
          const channel = await ChannelModel.create(channelData, creatorId);

          // Log channel creation
          await AuditModel.log({
            userId: creatorId,
            action: 'channel_created',
            details: { 
              channelId: channel.id, 
              channelName: channel.name 
            }
          });

          return channel;
        }
      );
    } catch (error) {
      console.error('Channel creation error:', error);
      
      await AuditModel.log({
        userId: creatorId,
        action: 'channel_creation_failed',
        details: { 
          channelName: channelData.name,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Get channel details
   * @param {string} channelId - Channel ID
   * @param {string} requesterId - ID of user requesting channel details
   * @returns {Promise<Object>} Channel details
   */
  static async getChannelDetails(channelId, requesterId) {
    try {
      // Check if user is a member or has read permission
      const isMember = await ChannelModel.isMember(channelId, requesterId);
      
      if (!isMember) {
        // Check if user has channel read permission
        const hasReadPermission = await PermissionService.hasPermission(
          requesterId, 
          'channel.read'
        );

        if (!hasReadPermission) {
          throw new Error('Not authorized to view channel details');
        }
      }

      // Fetch channel details
      const channel = await ChannelModel.getById(channelId);

      // Get channel members
      const members = await ChannelModel.getMembers(channelId);

      // Get channel message stats
      const messageStats = await MessageModel.getChannelMessageStats(channelId);

      return {
        ...channel,
        members,
        messageStats
      };
    } catch (error) {
      console.error('Get channel details error:', error);
      
      await AuditModel.log({
        userId: requesterId,
        action: 'channel_details_access_failed',
        details: { 
          channelId,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Update channel details
   * @param {string} channelId - Channel ID
   * @param {Object} updateData - Channel update details
   * @param {string} updaterId - ID of user updating the channel
   * @returns {Promise<Object>} Updated channel
   */
  static async updateChannel(channelId, updateData, updaterId) {
    try {
      // Validate user has update permission
      await PermissionService.authorizeAction(
        updaterId, 
        'channel.update', 
        async () => {
          // Check if user is a channel admin or has update permissions
          const isMember = await ChannelModel.isMember(channelId, updaterId);
          
          if (!isMember) {
            throw new Error('Not a member of this channel');
          }

          // Update channel
          const updatedChannel = await ChannelModel.update(channelId, updateData);

          // Log channel update
          await AuditModel.log({
            userId: updaterId,
            action: 'channel_updated',
            details: { 
              channelId, 
              updates: Object.keys(updateData) 
            }
          });

          return updatedChannel;
        }
      );
    } catch (error) {
      console.error('Channel update error:', error);
      
      await AuditModel.log({
        userId: updaterId,
        action: 'channel_update_failed',
        details: { 
          channelId,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Add member to a channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User ID to add
   * @param {string} inviterId - ID of user inviting
   * @param {string} [role='member'] - Role in channel
   * @returns {Promise<Object>} Channel membership details
   */
  static async addChannelMember(channelId, userId, inviterId, role = 'member') {
    try {
      // Validate inviter has permission to invite
      await PermissionService.authorizeAction(
        inviterId, 
        'channel.invite', 
        async () => {
          // Check if inviter is a member of the channel
          const isInviterMember = await ChannelModel.isMember(channelId, inviterId);
          
          if (!isInviterMember) {
            throw new Error('Not authorized to invite members');
          }

          // Add member to channel
          const membership = await ChannelModel.addMember(channelId, userId, role);

          // Log member addition
          await AuditModel.log({
            userId: inviterId,
            action: 'channel_member_added',
            details: { 
              channelId, 
              addedUserId: userId,
              role 
            }
          });

          return membership;
        }
      );
    } catch (error) {
      console.error('Add channel member error:', error);
      
      await AuditModel.log({
        userId: inviterId,
        action: 'channel_member_add_failed',
        details: { 
          channelId,
          addedUserId: userId,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Remove member from a channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User ID to remove
   * @param {string} removerId - ID of user removing the member
   * @returns {Promise<boolean>} Removal success
   */
  static async removeChannelMember(channelId, userId, removerId) {
    try {
      // Validate remover has permission
      await PermissionService.authorizeAction(
        removerId, 
        'channel.update', 
        async () => {
          // Check if remover is a member of the channel
          const isRemoverMember = await ChannelModel.isMember(channelId, removerId);
          
          if (!isRemoverMember) {
            throw new Error('Not authorized to remove members');
          }

          // Remove member from channel
          const removed = await ChannelModel.removeMember(channelId, userId);

          // Log member removal
          await AuditModel.log({
            userId: removerId,
            action: 'channel_member_removed',
            details: { 
              channelId, 
              removedUserId: userId 
            }
          });

          return removed;
        }
      );
    } catch (error) {
      console.error('Remove channel member error:', error);
      
      await AuditModel.log({
        userId: removerId,
        action: 'channel_member_remove_failed',
        details: { 
          channelId,
          removedUserId: userId,
          error: error.message 
        }
      });

      throw error;
    }
  }

  /**
   * Search channels
   * @param {Object} searchParams - Search parameters
   * @param {string} searcherId - ID of user performing search
   * @returns {Promise<Object[]>} List of channels
   */
  static async searchChannels(searchParams, searcherId) {
    try {
      // Validate search permission
      await PermissionService.authorizeAction(
        searcherId, 
        'channel.read', 
        async () => {
          // Perform channel search
          const channels = await ChannelModel.search(searchParams);

          // Log channel search
          await AuditModel.log({
            userId: searcherId,
            action: 'channel_search',
            details: { 
              searchParams 
            }
          });

          return channels;
        }
      );
    } catch (error) {
      console.error('Channel search error:', error);
      
      await AuditModel.log({
        userId: searcherId,
        action: 'channel_search_failed',
        details: { 
          searchParams,
          error: error.message 
        }
      });

      throw error;
    }
  }
}

module.exports = ChannelService;