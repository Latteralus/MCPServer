const db = require('../config/database');
const crypto = require('crypto');

class UserModel {
  /**
   * Get all users
   * @returns {Promise<Object[]>} All users
   */
  static async getAll() {
    const query = `
      SELECT 
        id, 
        username, 
        email, 
        first_name, 
        last_name, 
        role_id, 
        status, 
        last_login, 
        created_at
      FROM users
      WHERE status != 'deleted'
    `;

    try {
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User details
   */
  static async getById(userId) {
    const query = `
      SELECT 
        id, 
        username, 
        email, 
        first_name, 
        last_name, 
        role_id, 
        status, 
        last_login, 
        created_at
      FROM users
      WHERE id = $1 AND status != 'deleted'
    `;

    try {
      const result = await db.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  }

  /**
   * Find user by username
   * @param {string} username - Username
   * @returns {Promise<Object>} User details
   */
  static async findByUsername(username) {
    const query = `
      SELECT 
        id, 
        username, 
        email, 
        password_hash, 
        salt, 
        first_name, 
        last_name, 
        role_id, 
        status, 
        failed_login_attempts, 
        lockout_until
      FROM users
      WHERE username = $1 AND status != 'deleted'
    `;

    try {
      const result = await db.query(query, [username]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by username:', error);
      throw error;
    }
  }

  /**
   * Find user by token (placeholder implementation)
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} User details
   */
  static async findByToken(token) {
    // In a real implementation, you would have a tokens table or caching system
    // This is a simplified placeholder implementation
    try {
      // Extract user ID from token (in a real system, you'd validate the token)
      // For example purposes only - not secure for production
      const query = `
        SELECT 
          u.id, 
          u.username, 
          u.email, 
          u.first_name, 
          u.last_name, 
          r.name as role
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.status = 'active'
        LIMIT 1
      `;
      
      const result = await db.query(query);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by token:', error);
      return null;
    }
  }

  /**
   * Create a new user
   * @param {Object} userData - User creation data
   * @returns {Promise<Object>} Created user
   */
  static async create(userData) {
    const { 
      username, 
      email, 
      password, 
      firstName, 
      lastName, 
      roleId = null 
    } = userData;

    // Generate salt and hash password
    const salt = await this.generateSalt();
    const passwordHash = await this.hashPassword(password, salt);

    // Get default role if not specified
    let userRoleId = roleId;
    if (!userRoleId) {
      const defaultRoleQuery = 'SELECT id FROM roles WHERE is_default = true LIMIT 1';
      const roleResult = await db.query(defaultRoleQuery);
      userRoleId = roleResult.rows[0]?.id;
    }

    const query = `
      INSERT INTO users (
        username, 
        email, 
        password_hash, 
        salt, 
        first_name, 
        last_name, 
        role_id, 
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, username, email, first_name, last_name, status, created_at
    `;

    try {
      const result = await db.query(query, [
        username, 
        email, 
        passwordHash, 
        salt, 
        firstName, 
        lastName, 
        userRoleId, 
        'active'
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Generate a random salt
   * @returns {Promise<string>} Generated salt
   */
  static async generateSalt() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Hash a password with the given salt
   * @param {string} password - Plain text password
   * @param {string} salt - Salt for hashing
   * @returns {Promise<string>} Hashed password
   */
  static async hashPassword(password, salt) {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        resolve(derivedKey.toString('hex'));
      });
    });
  }

  /**
   * Verify a password against stored hash
   * @param {string} password - Plain text password to verify
   * @param {string} storedHash - Stored password hash
   * @param {string} salt - Salt used for hashing
   * @returns {Promise<boolean>} Whether password matches
   */
  static async verifyPassword(password, storedHash, salt) {
    const hash = await this.hashPassword(password, salt);
    return hash === storedHash;
  }

  /**
   * Update failed login attempts
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  static async incrementFailedLoginAttempts(userId) {
    const query = `
      UPDATE users
      SET 
        failed_login_attempts = failed_login_attempts + 1,
        lockout_until = CASE 
          WHEN failed_login_attempts + 1 >= 5 
          THEN NOW() + INTERVAL '15 minutes' 
          ELSE lockout_until 
        END
      WHERE id = $1
    `;

    try {
      await db.query(query, [userId]);
    } catch (error) {
      console.error('Error incrementing failed login attempts:', error);
      throw error;
    }
  }

  /**
   * Reset failed login attempts
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  static async resetFailedLoginAttempts(userId) {
    const query = `
      UPDATE users
      SET 
        failed_login_attempts = 0,
        lockout_until = NULL
      WHERE id = $1
    `;

    try {
      await db.query(query, [userId]);
    } catch (error) {
      console.error('Error resetting failed login attempts:', error);
      throw error;
    }
  }

  /**
   * Update last login timestamp
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  static async updateLastLogin(userId) {
    const query = `
      UPDATE users
      SET last_login = NOW()
      WHERE id = $1
    `;

    try {
      await db.query(query, [userId]);
    } catch (error) {
      console.error('Error updating last login:', error);
      throw error;
    }
  }

  /**
   * Update user password
   * @param {string} userId - User ID
   * @param {string} passwordHash - New password hash
   * @param {string} salt - New salt
   * @returns {Promise<void>}
   */
  static async updatePassword(userId, passwordHash, salt) {
    const query = `
      UPDATE users
      SET 
        password_hash = $1,
        salt = $2
      WHERE id = $3
    `;

    try {
      await db.query(query, [passwordHash, salt, userId]);
    } catch (error) {
      console.error('Error updating password:', error);
      throw error;
    }
  }

  /**
   * Update notification preferences
   * @param {string} userId - User ID
   * @param {Object} preferences - Notification preferences
   * @returns {Promise<Object>} Updated user
   */
  static async updateNotificationPreferences(userId, preferences) {
    // This would typically be stored in a user_preferences table
    // Simplified implementation for now
    const query = `
      UPDATE users
      SET metadata = COALESCE(metadata, '{}')::jsonb || $1::jsonb
      WHERE id = $2
      RETURNING id, username, email, first_name, last_name
    `;

    try {
      const result = await db.query(query, [
        JSON.stringify({ notificationPreferences: preferences }),
        userId
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      throw error;
    }
  }
}

module.exports = UserModel;