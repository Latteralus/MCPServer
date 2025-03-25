const ChannelModel = require('../models/channelModel');
const MessageModel = require('../models/messageModel');
const PermissionService = require('./permissionService');

class ResourceAuthorizationService {
  /**
   * Check if a user can access a specific message
   * @param {string} userId - User ID
   * @param {string} messageId - Message ID
   * @returns {Promise<boolean>} Whether user can access the message
   */
  static async canAccessMessage(userId, messageId) {
    // First check if message exists
    const message = await MessageModel.getById(messageId);
    if (!message) return false;
    
    // User is the sender
    if (message.senderId === userId) return true;
    
    // User is an admin
    const isAdmin = await PermissionService.hasPermission(userId, 'admin.messages');
    if (isAdmin) return true;
    
    // User is a channel member
    const isChannelMember = await ChannelModel.isMember(message.channelId, userId);
    return isChannelMember;
  }

  /**
   * Check if a user can modify a specific message
   * @param {string} userId - User ID
   * @param {string} messageId - Message ID
   * @returns {Promise<boolean>} Whether user can modify the message
   */
  static async canModifyMessage(userId, messageId) {
    // First check if message exists
    const message = await MessageModel.getById(messageId);
    if (!message) return false;
    
    // User is the sender
    if (message.senderId === userId) return true;
    
    // User is an admin
    const isAdmin = await PermissionService.hasPermission(userId, 'admin.messages');
    return isAdmin;
  }

  /**
   * Check if a user can access a specific channel
   * @param {string} userId - User ID
   * @param {string} channelId - Channel ID
   * @returns {Promise<boolean>} Whether user can access the channel
   */
  static async canAccessChannel(userId, channelId) {
    // First check if channel exists
    const channel = await ChannelModel.getById(channelId);
    if (!channel) return false;
    
    // Public channels are accessible to all
    if (!channel.is_private) return true;
    
    // User is a channel member
    const isChannelMember = await ChannelModel.isMember(channelId, userId);
    if (isChannelMember) return true;
    
    // User is an admin
    const isAdmin = await PermissionService.hasPermission(userId, 'admin.channels');
    return isAdmin;
  }

  /**
   * Check if a user can modify a specific channel
   * @param {string} userId - User ID
   * @param {string} channelId - Channel ID
   * @returns {Promise<boolean>} Whether user can modify the channel
   */
  static async canModifyChannel(userId, channelId) {
    // First check if channel exists
    const channel = await ChannelModel.getById(channelId);
    if (!channel) return false;
    
    // User is a channel member
    const isChannelMember = await ChannelModel.isMember(channelId, userId);
    if (!isChannelMember) return false;
    
    // User has channel admin role
    // Assuming channel membership might include roles
    const membership = await ChannelModel.getMembership(channelId, userId);
    if (membership && membership.role === 'admin') return true;
    
    // User is a global admin
    const isAdmin = await PermissionService.hasPermission(userId, 'admin.channels');
    return isAdmin;
  }
  
  /**
   * Handle the local developer case in a secure way
   * @param {Object} user - User object
   * @returns {boolean} Whether user is a local developer
   */
  static isLocalDeveloper(user) {
    // Only allow in development environment
    const env = process.env.NODE_ENV || 'development';
    if (env !== 'development') return false;
    
    return !user.id || user.username === 'Local Developer';
  }
}

module.exports = ResourceAuthorizationService;