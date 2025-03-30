const RoleModel = require('../models/roleModel');
const UserModel = require('../models/userModel');
const AuditModel = require('../models/auditModel');
const config = require('../config');
const logger = require('../config/logger'); // Import logger

class PermissionService {
  /**
   * Check if a user has a specific permission
   * @param {string} userId - User ID
   * @param {string} permissionName - Permission to check
   * @returns {Promise<boolean>} Whether user has the permission
   */
  static async hasPermission(userId, permissionName) {
    try {
      // Fetch user
      const user = await UserModel.getById(userId);
      
      if (!user) {
        return false;
      }

      // Fetch role
      const role = await RoleModel.getById(user.roleId);
      
      if (!role) {
        return false;
      }

      // Check if role has the permission
      return await RoleModel.hasPermission(role.id, permissionName);
    } catch (error) {
      logger.error({ err: error, userId, permissionName }, 'Permission check error');
      
      await AuditModel.log({
        userId,
        action: 'permission_check_failed',
        details: { 
          permissionName, 
          error: error.message 
        }
      });

      return false;
    }
  }

  /**
   * Get all permissions for a user
   * @param {string} userId - User ID
   * @returns {Promise<string[]>} List of permission names
   */
  static async getUserPermissions(userId) {
    try {
      // Fetch user
      const user = await UserModel.getById(userId);
      
      if (!user) {
        return [];
      }

      // Get role permissions
      const permissions = await RoleModel.getPermissions(user.roleId);
      
      return permissions.map(perm => perm.name);
    } catch (error) {
      logger.error({ err: error, userId }, 'Get user permissions error');
      
      await AuditModel.log({
        userId,
        action: 'get_permissions_failed',
        details: { error: error.message }
      });

      return [];
    }
  }

  /**
   * Validate user has required permissions
   * @param {string} userId - User ID
   * @param {string|string[]} requiredPermissions - Permission(s) to validate
   * @param {Object} options - Validation options
   * @returns {Promise<boolean>} Permission validation result
   */
  static async validatePermissions(
    userId, 
    requiredPermissions, 
    options = { requireAll: false }
  ) {
    try {
      // Normalize permissions to array
      const permissions = Array.isArray(requiredPermissions) 
        ? requiredPermissions 
        : [requiredPermissions];

      // Get user's permissions
      const userPermissions = await this.getUserPermissions(userId);

      // Check permissions based on requirement type
      if (options.requireAll) {
        // User must have ALL specified permissions
        return permissions.every(perm => userPermissions.includes(perm));
      } else {
        // User must have AT LEAST ONE of the specified permissions
        return permissions.some(perm => userPermissions.includes(perm));
      }
    } catch (error) {
      logger.error({ err: error, userId, requiredPermissions, options }, 'Permission validation error');
      
      await AuditModel.log({
        userId,
        action: 'permission_validation_failed',
        details: { 
          requiredPermissions, 
          error: error.message 
        }
      });

      return false;
    }
  }

  /**
   * Authorize an action with permission check
   * @param {string} userId - User ID
   * @param {string} permissionName - Required permission
   * @param {Function} action - Action to authorize
   * @returns {Promise<*>} Result of the action
   * @throws {Error} If user lacks permission
   */
  static async authorizeAction(userId, permissionName, action) {
    // Check if user has required permission
    const hasPermission = await this.hasPermission(userId, permissionName);

    if (!hasPermission) {
      // Log unauthorized attempt
      await AuditModel.log({
        userId,
        action: 'unauthorized_action_attempt',
        details: { 
          requiredPermission: permissionName 
        }
      });

      throw new Error(`User lacks required permission: ${permissionName}`);
    }

    // Log authorized action
    await AuditModel.log({
      userId,
      action: 'authorized_action',
      details: { 
        permission: permissionName 
      }
    });

    // Execute and return action result
    return action();
  }

  /**
   * Check if user can access channel
   * @param {string} userId - User ID
   * @param {string} channelId - Channel ID
   * @returns {Promise<boolean>} Whether user can access channel
   */
  static async canAccessChannel(userId, channelId) {
    try {
      // Check if user is a member of the channel
      const isMember = await require('../models/channelModel').isMember(channelId, userId);
      
      if (isMember) {
        return true;
      }
      
      // If not a member, check if user has admin access
      const hasAdminAccess = await this.hasPermission(userId, 'admin.channels');
      
      return hasAdminAccess;
    } catch (error) {
      logger.error({ err: error, userId, channelId }, 'Channel access check error');
      
      await AuditModel.log({
        userId,
        action: 'channel_access_check_failed',
        details: { 
          channelId, 
          error: error.message 
        }
      });
      
      return false;
    }
  }

  /**
   * Check if user can modify a message
   * @param {string} userId - User ID
   * @param {string} messageId - Message ID
   * @returns {Promise<boolean>} Whether user can modify message
   */
  static async canModifyMessage(userId, messageId) {
    try {
      // Get message details
      const message = await require('../models/messageModel').getById(messageId, userId);
      
      if (!message) {
        return false;
      }
      
      // Message author can always modify their own messages
      if (message.senderId === userId) {
        return true;
      }
      
      // Otherwise, check for admin permission
      const hasAdminAccess = await this.hasPermission(userId, 'admin.messages');
      
      return hasAdminAccess;
    } catch (error) {
      logger.error({ err: error, userId, messageId }, 'Message modification check error');
      
      await AuditModel.log({
        userId,
        action: 'message_modification_check_failed',
        details: { 
          messageId, 
          error: error.message 
        }
      });
      
      return false;
    }
  }

  /**
   * Get allowed channels for a user
   * @param {string} userId - User ID
   * @returns {Promise<string[]>} Array of accessible channel IDs
   */
  static async getAllowedChannels(userId) {
    try {
      // Get channels where user is a member
      const memberChannels = await require('../models/channelModel').getUserChannels(userId);
      
      // If user has admin access, include all channels
      const hasAdminAccess = await this.hasPermission(userId, 'admin.channels');
      
      if (hasAdminAccess) {
        const allChannels = await require('../models/channelModel').getAll();
        const channelIds = new Set([
          ...memberChannels.map(ch => ch.id),
          ...allChannels.map(ch => ch.id)
        ]);
        
        return Array.from(channelIds);
      }
      
      return memberChannels.map(ch => ch.id);
    } catch (error) {
      logger.error({ err: error, userId }, 'Get allowed channels error');
      
      await AuditModel.log({
        userId,
        action: 'get_allowed_channels_failed',
        details: { 
          error: error.message 
        }
      });
      
      return [];
    }
  }
}

module.exports = PermissionService;