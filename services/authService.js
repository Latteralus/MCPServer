// services/authService.js
const UserModel = require('../models/userModel');
const db = require('../config/database');
const crypto = require('crypto');
const argon2 = require('argon2');
const logger = require('../config/logger'); // Import logger

// Cache for active sessions to reduce database load
const SESSION_CACHE = new Map();
const SESSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Key for token validation - Loaded from environment variables via config.js
// config.js already validates that JWT_SECRET is present.
const JWT_SECRET = process.env.JWT_SECRET;
// Additional check for defense in depth
if (!JWT_SECRET) {
  logger.fatal('CRITICAL ERROR: JWT_SECRET environment variable is required but missing. Application cannot securely start.');
  // In a real application, you might throw an error or exit differently,
  // but config.js should have already prevented startup.
  // but config.js should have already prevented startup.
  throw new Error('JWT_SECRET is not defined');
}

class AuthService {
  /**
   * Validate a session token
   * @param {string} token - Session token
   * @returns {Promise<Object|null>} User object or null if invalid
   */
  static async validateSessionToken(token) {
    try {
      // Mask token in logs for security
      logger.debug(`Validating token: ${token ? token.substring(0, 8) : 'N/A'}...`); // Added null check
      
      // Check cache first
      const cachedSession = SESSION_CACHE.get(token);
      if (cachedSession && cachedSession.expiresAt > Date.now()) {
        return cachedSession.user;
      }
      
      
      // Token format validation
      if (!token || typeof token !== 'string') {
        logger.warn('Invalid token format received for validation.');
        return null;
      }
      // Check if token exists in database
      const user = await UserModel.validateSession(token);
      
      if (!user) {
        logger.warn({ tokenPrefix: token ? token.substring(0, 8) : 'N/A' }, 'Token not found in database or invalid');
        return null;
      }
      
      // Add to cache
      SESSION_CACHE.set(token, {
        user,
        expiresAt: Date.now() + SESSION_CACHE_TTL
      });
      
      return user;
    } catch (error) {
      logger.error({ err: error, tokenPrefix: token ? token.substring(0, 8) : 'N/A' }, 'Token validation error');
      return null;
    }
  }

  /**
   * Validate username and password
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object|null>} User object or null if invalid
   */
  static async validateCredentials(username, password) {
    try {
      logger.info(`Validating credentials for: ${username}`);
      
      // Check if user exists in database
      const user = await UserModel.findByUsername(username);
      
      if (!user) {
        logger.warn({ username }, `User not found during credential validation`);
        return null;
      }
      
      // Check for account lockout
      if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
        logger.warn({ username, lockoutUntil: user.lockout_until }, `Account locked`);
        return null;
      }
      
      // Verify password
      let passwordValid = false;
      
      try {
        // Check the password hash type to handle legacy passwords
        if (user.password_hash_type === 'sha256') {
          // Legacy SHA-256 password
          const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
          passwordValid = (legacyHash === user.password_hash);
          
          // If valid, upgrade to Argon2 for next login
          if (passwordValid) {
            await this.upgradePasswordHash(user.id, password);
          }
        } else if (user.password_hash_type === 'pbkdf2') {
          // PBKDF2 password (from migration)
          const hash = await new Promise((resolve, reject) => {
            crypto.pbkdf2(password, user.salt, 10000, 64, 'sha512', (err, derivedKey) => {
              if (err) reject(err);
              resolve(derivedKey.toString('hex'));
            });
          });
          passwordValid = (hash === user.password_hash);
          
          // If valid, upgrade to Argon2 for next login
          if (passwordValid) {
            await this.upgradePasswordHash(user.id, password);
          }
        } else {
          // Argon2 password (current standard)
          passwordValid = await argon2.verify(user.password_hash, password);
        }
      } catch (verifyError) {
        logger.error({ err: verifyError, username }, 'Password verification error');
        passwordValid = false;
      }
      
      if (!passwordValid) {
        logger.warn({ username }, 'Password incorrect during credential validation');
        
        // Track failed attempts
        await UserModel.recordFailedLogin(user.id);
        return null;
      }
      
      // Reset failed attempts on successful login
      if (user.failed_login_attempts > 0) {
        await UserModel.resetFailedLogins(user.id);
      }
      
      // Check if password reset required
      if (user.force_password_change) {
        user.requiresPasswordChange = true;
      }
      
      return user;
    } catch (error) {
      logger.error({ err: error, username }, 'Credential validation error');
      return null;
    }
  }

  /**
   * Upgrade a password hash to Argon2
   * @param {string} userId - User ID
   * @param {string} password - Plain text password
   * @returns {Promise<void>}
   */
  static async upgradePasswordHash(userId, password) {
    try {
      // Generate new Argon2 hash
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 16384, // 16 MB
        timeCost: 3, // 3 iterations
        parallelism: 2
      });
      
      // Update user record
      await UserModel.update({
        id: userId,
        passwordHash,
        passwordHashType: 'argon2id',
        passwordLastChanged: new Date()
      });
      
      logger.info({ userId }, `Password hash upgraded`);
    } catch (error) {
      logger.error({ err: error, userId }, 'Password hash upgrade failed');
      throw error;
    }
  }

  /**
   * Generate a session token for a user
   * @param {Object} user - User object
   * @param {Object} metadata - Session metadata (IP, user agent)
   * @returns {Promise<string>} Session token
   */
  static async generateSessionToken(user, metadata = {}) {
    try {
      // Generate a secure random token
      const randomPart = crypto.randomBytes(32).toString('hex');
      const timestamp = Date.now().toString(36);
      
      // Create token with user role prefix for easy identification
      const token = `${user.role}_${timestamp}_${user.id}_${randomPart}`;
      
      // Store in database
      await UserModel.createSession(user.id, token, metadata);
      
      // Store in cache
      SESSION_CACHE.set(token, {
        user,
        expiresAt: Date.now() + SESSION_CACHE_TTL
      });
      
      // Mask token in logs
      logger.debug({ userId: user.id, tokenPrefix: token.substring(0, 8) }, `Generated token`);
      
      return token;
    } catch (error) {
      logger.error({ err: error, userId: user?.id }, 'Token generation error');
      throw error;
    }
  }

  /**
   * Invalidate a session token
   * @param {string} token - Session token to invalidate
   * @returns {Promise<boolean>} Success status
   */
  static async invalidateToken(token) {
    try {
      // Remove from cache
      SESSION_CACHE.delete(token);
      
      // Invalidate in database
      const success = await UserModel.invalidateSession(token);
      
      return success;
    } catch (error) {
      logger.error({ err: error, tokenPrefix: token ? token.substring(0, 8) : 'N/A' }, 'Token invalidation error');
      return false;
    }
  }

  /**
   * Change a user's password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @param {string} adminId - Admin ID if changed by admin (optional)
   * @returns {Promise<boolean>} Success status
   */
  static async changePassword(userId, currentPassword, newPassword, adminId = null) {
    try {
      // If adminId is provided, admin is changing the password
      if (adminId) {
        // Admin can change password without current password
        return await UserModel.changePassword(userId, newPassword, adminId);
      }
      
      // Get user details
      const user = await UserModel.getById(userId);
      
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
      
      // Verify current password
      const isValid = await this.validateCredentials(user.username, currentPassword);
      
      if (!isValid) {
        throw new Error('Current password is incorrect');
      }
      
      // Change password
      return await UserModel.changePassword(userId, newPassword, userId);
    } catch (error) {
      logger.error({ err: error, userId, adminId }, 'Password change error');
      throw error;
    }
  }

  /**
   * Generate a recovery code for password reset
   * @param {string} username - Username
   * @returns {Promise<Object>} Recovery code info
   */
  static async generateRecoveryCode(username) {
    try {
      // Check if user exists
      const user = await UserModel.findByUsername(username);
      
      if (!user) {
        throw new Error(`User not found: ${username}`);
      }
      
      // Generate recovery code
      const recoveryInfo = await UserModel.generateRecoveryCode(username);
      
      return recoveryInfo;
    } catch (error) {
      logger.error({ err: error, username }, 'Recovery code generation error');
      throw error;
    }
  }

  /**
   * Reset password with recovery code
   * @param {string} username - Username
   * @param {string} recoveryCode - Recovery code
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} Success status
   */
  static async resetPasswordWithCode(username, recoveryCode, newPassword) {
    try {
      return await UserModel.resetPasswordWithCode(username, recoveryCode, newPassword);
    } catch (error) {
      logger.error({ err: error, username }, 'Password reset error');
      throw error;
    }
  }

  /**
   * Clean up expired tokens from cache
   */
  static cleanupExpiredTokens() {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [token, session] of SESSION_CACHE.entries()) {
      if (session.expiresAt < now) {
        SESSION_CACHE.delete(token);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      logger.info(`Cleaned up ${expiredCount} expired tokens from cache`);
    }
  }
  
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @param {string} createdBy - User ID of creator
   * @returns {Promise<Object>} Created user
   */
  static async createUser(userData, createdBy = null) {
    try {
      // Validate user data
      if (!userData.username || !userData.password) {
        throw new Error('Username and password are required');
      }
      
      // Check if username already exists
      const existingUser = await UserModel.findByUsername(userData.username);
      
      if (existingUser) {
        throw new Error(`Username already exists: ${userData.username}`);
      }
      
      // Create user
      return await UserModel.create({
        ...userData,
        createdBy
      });
    } catch (error) {
      logger.error({ err: error, username: userData?.username, createdBy }, 'User creation error');
      throw error;
    }
  }
  
  /**
   * Initialize the authentication system with a default admin if none exists
   * @returns {Promise<void>}
   */
  static async initializeSystem() {
    try {
      // Check if any admin users exist
      const adminUsers = await UserModel.findByRole('super_admin');
      
      if (adminUsers.length === 0) {
        logger.info('No super admin users found, checking for initialization parameters...');
        
        // Check if we have environment variables for initial setup
        const initialAdminUsername = process.env.INITIAL_ADMIN_USERNAME;
        const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD; // Added check for password
        
        if (initialAdminUsername && initialAdminPassword) {
          // Use provided credentials
          logger.info('INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD provided. Creating initial admin user...');
          
          // Create admin user
          const adminUser = await this.createUser({
            username: initialAdminUsername,
            password: initialAdminPassword, // Use provided password
            firstName: 'System',
            lastName: 'Administrator',
            role: 'super_admin',
            forcePasswordChange: false // Password provided, no need to force change
          }, 'system');
          
          logger.info('=======================================================');
          logger.info('INITIAL ADMIN ACCOUNT CREATED');
          logger.info(`Username: ${initialAdminUsername}`);
          logger.info('Password set from INITIAL_ADMIN_PASSWORD environment variable.');
          logger.info('=======================================================');
        } else if (initialAdminUsername) {
           // Only username provided - Keep old behavior (temporary password) for backward compatibility?
           // OR enforce both? For better security, let's enforce both.
           logger.warn('INITIAL_ADMIN_USERNAME is set, but INITIAL_ADMIN_PASSWORD is MISSING.');
           logger.warn('Both environment variables are required to create the initial admin user.');
        } else {
          logger.warn('No admin users exist and INITIAL_ADMIN_USERNAME environment variable is not set.');
          logger.warn('Please set INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD environment variables and restart the application.');
        }
      } else {
        logger.info(`Found ${adminUsers.length} existing admin users. System is already initialized.`);
      }
    } catch (error) {
      logger.error({ err: error }, 'System initialization error');
      throw error;
    }
  }
}

// Set up cleanup interval
setInterval(AuthService.cleanupExpiredTokens, 15 * 60 * 1000); // 15 minutes

// Initialize the system when the module is loaded
if (process.env.NODE_ENV !== 'test') {
  AuthService.initializeSystem().catch(error => {
    logger.error({ err: error }, 'Failed to initialize authentication system');
  });
}

module.exports = AuthService;