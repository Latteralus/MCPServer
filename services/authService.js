// services/authService.js
const UserModel = require('../models/userModel');
const db = require('../config/database');
const crypto = require('crypto');

// Cache for active sessions to reduce database load
const SESSION_CACHE = new Map();
const SESSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Valid registered users (in a real app, this would be in the database)
// This is a temporary solution until a proper user database is implemented
const REGISTERED_USERS = new Map([
  ['CBarnett', { 
    id: 'admin_default',
    username: 'CBarnett', 
    passwordHash: hashPassword('Admin123'), 
    role: 'admin',
    displayName: 'Admin'
  }],
  ['user1', { 
    id: 'user_1',
    username: 'user1', 
    passwordHash: hashPassword('password1'), 
    role: 'user',
    displayName: 'Test User 1'
  }],
  ['user2', { 
    id: 'user_2',
    username: 'user2', 
    passwordHash: hashPassword('password2'), 
    role: 'user',
    displayName: 'Test User 2'
  }]
]);

// Key for token validation
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'your-secret-key-should-be-in-env-variables';

class AuthService {
  /**
   * Validate a session token
   * @param {string} token - Session token
   * @returns {Promise<Object|null>} User object or null if invalid
   */
  static async validateSessionToken(token) {
    try {
      console.log(`Validating token: ${token}`);
      
      // Check cache first
      const cachedSession = SESSION_CACHE.get(token);
      if (cachedSession && cachedSession.expiresAt > Date.now()) {
        return cachedSession.user;
      }
      
      // Token format validation
      if (!token || typeof token !== 'string') {
        console.log('Invalid token format');
        return null;
      }
      
      // Parse token parts
      const tokenParts = token.split('_');
      if (tokenParts.length < 2) {
        console.log('Token format invalid - missing parts');
        return null;
      }
      
      const tokenType = tokenParts[0];
      const tokenData = tokenParts.slice(1).join('_');
      
      // Verify token type
      if (tokenType !== 'admin' && tokenType !== 'user' && tokenType !== 'dev') {
        console.log(`Invalid token type: ${tokenType}`);
        return null;
      }
      
      // Extract timestamp from tokenData (this assumes a specific format)
      const timestampHex = tokenData.substr(0, 8); // Assuming timestamp is first 8 chars
      const timestamp = parseInt(timestampHex, 36);
      
      // Check if token is expired (tokens valid for 24 hours)
      const now = Date.now();
      const tokenAge = now - timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (tokenAge > maxAge) {
        console.log('Token expired');
        return null;
      }
      
      // Check token validity against registered users
      // In a real system, this would be a database query
      
      // For admin tokens
      if (tokenType === 'admin') {
        const admin = Array.from(REGISTERED_USERS.values()).find(u => u.role === 'admin');
        if (!admin) {
          console.log('No admin user found');
          return null;
        }
        
        // Add to cache
        SESSION_CACHE.set(token, {
          user: admin,
          expiresAt: now + SESSION_CACHE_TTL
        });
        
        return admin;
      }
      
      // For user tokens
      // In a real system, verify token against database
      // For now, extract user ID from token and check against REGISTERED_USERS
      
      // This is a simplified check - in a real system, you'd verify a signature
      const userIdPart = tokenData.split('_')[1]; // Assuming format is timestamp_userid_random
      if (!userIdPart) {
        console.log('Cannot extract user ID from token');
        return null;
      }
      
      const user = Array.from(REGISTERED_USERS.values()).find(u => 
        u.id === `user_${userIdPart}` || u.id === userIdPart
      );
      
      if (!user) {
        console.log(`User not found for ID: ${userIdPart}`);
        return null;
      }
      
      // Add to cache
      SESSION_CACHE.set(token, {
        user,
        expiresAt: now + SESSION_CACHE_TTL
      });
      
      return user;
    } catch (error) {
      console.error('Token validation error:', error);
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
      console.log(`Validating credentials for: ${username}`);
      
      // Check if user exists in our registered users list
      const user = REGISTERED_USERS.get(username);
      
      if (!user) {
        console.log(`User not found: ${username}`);
        return null;
      }
      
      // Verify password
      const passwordHash = hashPassword(password);
      if (passwordHash !== user.passwordHash) {
        console.log('Password incorrect');
        return null;
      }
      
      return user;
    } catch (error) {
      console.error('Credential validation error:', error);
      return null;
    }
  }

  /**
   * Generate a session token for a user
   * @param {Object} user - User object
   * @returns {Promise<string>} Session token
   */
  static async generateSessionToken(user) {
    try {
      // Generate a token with timestamp and random data
      const timestamp = Date.now().toString(36);
      const randomPart = crypto.randomBytes(8).toString('hex');
      
      // Format depends on user role
      let token;
      if (user.role === 'admin') {
        token = `admin_${timestamp}_${randomPart}`;
      } else {
        // Extract numeric part from user ID
        const userIdPart = user.id.includes('_') ? user.id.split('_')[1] : user.id;
        token = `user_${timestamp}_${userIdPart}_${randomPart}`;
      }
      
      // Store in cache
      SESSION_CACHE.set(token, {
        user,
        expiresAt: Date.now() + SESSION_CACHE_TTL
      });
      
      return token;
    } catch (error) {
      console.error('Token generation error:', error);
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
      
      // In a real system, mark token as invalid in database
      
      return true;
    } catch (error) {
      console.error('Token invalidation error:', error);
      return false;
    }
  }

  /**
   * Clean up expired tokens from cache
   */
  static cleanupExpiredTokens() {
    const now = Date.now();
    
    for (const [token, session] of SESSION_CACHE.entries()) {
      if (session.expiresAt < now) {
        SESSION_CACHE.delete(token);
      }
    }
  }
}

/**
 * Hash a password (helper function)
 * @param {string} password - Plain text password
 * @returns {string} Hashed password
 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Set up cleanup interval
setInterval(AuthService.cleanupExpiredTokens, 15 * 60 * 1000); // 15 minutes

module.exports = AuthService;