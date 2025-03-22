const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const RoleModel = require('../models/roleModel');
const AuditModel = require('../models/auditModel');
const config = require('../config');

class AuthService {
  /**
   * Authenticate user credentials
   * @param {string} username - Username
   * @param {string} password - Plain text password
   * @param {string} [ipAddress] - IP address of login attempt
   * @returns {Promise<Object>} Authentication result
   */
  static async authenticate(username, password, ipAddress = null) {
    try {
      // Find user by username
      const user = await UserModel.findByUsername(username);

      if (!user) {
        // Log failed login attempt
        await AuditModel.log({
          action: 'login_failed',
          details: { 
            username, 
            reason: 'user_not_found',
            ipAddress 
          }
        });
        return null;
      }

      // Check if user account is locked
      if (user.failedLoginAttempts >= 5 && user.lockoutUntil > new Date()) {
        await AuditModel.log({
          userId: user.id,
          action: 'login_blocked',
          details: { 
            reason: 'account_locked',
            lockoutUntil: user.lockoutUntil,
            ipAddress 
          }
        });
        return null;
      }

      // Verify password
      const isPasswordValid = await UserModel.verifyPassword(
        password, 
        user.passwordHash, 
        user.salt
      );

      if (!isPasswordValid) {
        // Increment failed login attempts
        await UserModel.incrementFailedLoginAttempts(user.id);

        await AuditModel.log({
          userId: user.id,
          action: 'login_failed',
          details: { 
            reason: 'incorrect_password',
            ipAddress 
          }
        });

        return null;
      }

      // Reset failed login attempts
      await UserModel.resetFailedLoginAttempts(user.id);

      // Update last login timestamp
      await UserModel.updateLastLogin(user.id);

      // Get user's role and permissions
      const role = await RoleModel.getById(user.roleId);
      const permissions = await RoleModel.getPermissions(user.roleId);

      // Log successful login
      await AuditModel.log({
        userId: user.id,
        action: 'login_success',
        details: { 
          ipAddress,
          username 
        }
      });

      // Return user details without sensitive information
      return {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: {
          id: role.id,
          name: role.name
        },
        permissions: permissions.map(p => p.name)
      };
    } catch (error) {
      console.error('Authentication error:', error);
      
      await AuditModel.log({
        action: 'auth_error',
        details: { 
          username, 
          error: error.message,
          ipAddress 
        }
      });

      return null;
    }
  }

  /**
   * Generate a JWT session token
   * @param {Object} user - User object
   * @returns {string} Session token
   */
  static generateSessionToken(user) {
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role.name
    };

    const secretKey = config.security.encryptionKey;
    // Token expires in 24 hours
    const token = jwt.sign(payload, secretKey, { expiresIn: '24h' });
    return token;
  }

  /**
   * Validate session token using JWT verification
   * @param {string} token - Session token
   * @returns {Promise<Object|null>} User details or null
   */
  static async validateSessionToken(token) {
    try {
      if (!token) return null;
      const secretKey = config.security.encryptionKey;
      // Verify token (this will throw if token is invalid or expired)
      const decoded = jwt.verify(token, secretKey);
      // Get user data
      const user = await UserModel.getById(decoded.userId);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      return {
        id: user.id,
        username: user.username,
        role: user.role
      };
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  }

  /**
   * Refresh the session token
   * @param {string} token - Current session token
   * @returns {Promise<string|null>} New session token or null if refresh fails
   */
  static async refreshToken(token) {
    try {
      const secretKey = config.security.encryptionKey;
      // Verify token ignoring expiration to extract payload
      const decoded = jwt.verify(token, secretKey, { ignoreExpiration: true });
      // Retrieve user from database to confirm validity
      const user = await UserModel.getById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }
      // Generate and return a new token
      const newToken = AuthService.generateSessionToken(user);
      return newToken;
    } catch (error) {
      console.error('Token refresh error:', error);
      return null;
    }
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} Password change success
   */
  static async changePassword(userId, currentPassword, newPassword) {
    try {
      // Fetch user
      const user = await UserModel.getById(userId);

      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await UserModel.verifyPassword(
        currentPassword, 
        user.passwordHash, 
        user.salt
      );

      if (!isCurrentPasswordValid) {
        await AuditModel.log({
          userId,
          action: 'password_change_failed',
          details: { reason: 'incorrect_current_password' }
        });
        return false;
      }

      // Generate new salt and hash
      const newSalt = await UserModel.generateSalt();
      const newPasswordHash = await UserModel.hashPassword(newPassword, newSalt);

      // Update user's password
      await UserModel.updatePassword(userId, newPasswordHash, newSalt);

      // Log password change
      await AuditModel.log({
        userId,
        action: 'password_changed',
        details: { method: 'self_service' }
      });

      return true;
    } catch (error) {
      console.error('Password change error:', error);
      
      await AuditModel.log({
        userId,
        action: 'password_change_failed',
        details: { error: error.message }
      });

      return false;
    }
  }

  /**
   * Reset user password (admin function)
   * @param {string} userId - User ID
   * @param {string} newPassword - New password
   * @param {string} adminId - ID of admin performing reset
   * @returns {Promise<boolean>} Password reset success
   */
  static async resetPassword(userId, newPassword, adminId) {
    try {
      // Generate new salt and hash
      const newSalt = await UserModel.generateSalt();
      const newPasswordHash = await UserModel.hashPassword(newPassword, newSalt);

      // Update user's password
      await UserModel.updatePassword(userId, newPasswordHash, newSalt);

      // Log password reset
      await AuditModel.log({
        userId,
        action: 'password_reset',
        details: { 
          method: 'admin_reset',
          adminId 
        }
      });

      return true;
    } catch (error) {
      console.error('Password reset error:', error);
      
      await AuditModel.log({
        userId,
        action: 'password_reset_failed',
        details: { 
          error: error.message,
          adminId 
        }
      });

      return false;
    }
  }
}

module.exports = AuthService;
