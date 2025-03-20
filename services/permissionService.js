const RoleModel = require('../models/roleModel');
const UserModel = require('../models/userModel');
const AuditModel = require('../models/auditModel');
const config = require('.../config');
const port = config.port;

class PermissionService {
  /**
   * Check if a user has a specific permission
   * @param {string} userId - User ID
   * @param {string} permissionName - Permission to check
   * @returns {Promise<boolean>} Whether user has the permission
   */
  static async hasPermission(userId, permissionName) {
    try {
      // Fetch user's role
      const user = await UserModel.getById(userId);
      
      if (!user) {
        return false;
      }

      // Check if role has the permission
      return await RoleModel.hasPermission(user.roleId, permissionName);
    } catch (error) {
      console.error('Permission check error:', error);
      
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
      // Fetch user's role
      const user = await UserModel.getById(userId);
      
      if (!user) {
        return [];
      }

      // Get role permissions
      const permissions = await RoleModel.getPermissions(user.roleId);
      
      return permissions.map(perm => perm.name);
    } catch (error) {
      console.error('Get user permissions error:', error);
      
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

      // Fetch user's permissions
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
      console.error('Permission validation error:', error);
      
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
}

module.exports = PermissionService;