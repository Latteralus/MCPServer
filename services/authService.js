const crypto = require('crypto');
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
   * Generate a secure session token
   * @param {Object} user - User object
   * @returns {string} Session token
   */
  static generateSessionToken(user) {
    // Create a secure payload
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role.name,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };

    // Encrypt and sign token
    const encryptionKey = config.security.encryptionKey;
    const payloadJson = JSON.stringify(payload);
    
    // First create an HMAC signature
    const hmac = crypto.createHmac('sha256', encryptionKey);
    hmac.update(payloadJson);
    const signature = hmac.digest('hex');
    
    // Combine payload and signature
    return Buffer.from(JSON.stringify({
      payload,
      signature
    })).toString('base64');
  }

  /**
   * Validate session token
   * @param {string} token - Session token
   * @returns {Promise<Object|null>} User details or null
   */
  static async validateSessionToken(token) {
    try {
      if (!token) return null;

      // Decode token
      const tokenData = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
      const { payload, signature } = tokenData;
      
      // Verify signature
      const encryptionKey = config.security.encryptionKey;
      const hmac = crypto.createHmac('sha256', encryptionKey);
      hmac.update(JSON.stringify(payload));
      const computedSignature = hmac.digest('hex');
      
      if (computedSignature !== signature) {
        throw new Error('Invalid token signature');
      }
      
      // Check if token is expired (default: 24 hours)
      const tokenTimestamp = payload.timestamp;
      const expirationTime = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      if (Date.now() - tokenTimestamp > expirationTime) {
        throw new Error('Token expired');
      }

      // Get user data
      const user = await UserModel.getById(payload.userId);
      
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