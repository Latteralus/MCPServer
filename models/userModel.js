const db = require('../config/database');
const crypto = require('crypto');
const argon2 = require('argon2');
const logger = require('../config/logger'); // Import logger

class UserModel {
  /**
   * Get all users (excluding those with status = 'deleted')
   * @returns {Promise<Object[]>}
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
        created_at,
        two_factor_enabled
      FROM users
      WHERE status != 'deleted'
    `;
    try {
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching all users');
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} The user record or null if not found
   */
  static async getById(userId) {
    const query = `
      SELECT
        u.id,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.role_id,
        r.name AS role,
        u.status,
        u.last_login,
        u.created_at,
        u.two_factor_enabled
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
        AND u.status != 'deleted'
    `;
    try {
      const result = await db.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error, userId }, 'Error fetching user by ID');
      throw error;
    }
  }

  /**
   * Find user by username
   * @param {string} username
   * @returns {Promise<Object|null>} The user record or null if not found
   */
  static async findByUsername(username) {
    const query = `
      SELECT
        u.id,
        u.username,
        u.email,
        u.password_hash,
        u.salt,
        u.first_name,
        u.last_name,
        u.role_id,
        r.name AS role,
        u.status,
        u.failed_login_attempts,
        u.lockout_until,
        u.two_factor_enabled,
        u.two_factor_secret,
        u.force_password_change,
        u.password_last_changed,
        u.password_hash_type
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.username = $1
        AND u.status != 'deleted'
    `;
    try {
      const result = await db.query(query, [username]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error, username }, 'Error finding user by username');
      throw error;
    }
  }

  /**
   * Find user by email
   * @param {string} email
   * @returns {Promise<Object|null>}
   */
  static async findByEmail(email) {
    const query = `
      SELECT
        u.id,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.role_id,
        r.name AS role,
        u.status
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.email = $1
        AND u.status != 'deleted'
    `;
    try {
      const result = await db.query(query, [email]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error, email }, 'Error finding user by email');
      throw error;
    }
  }

  /**
   * Find users by role name
   * @param {string} roleName
   * @returns {Promise<Object[]>}
   */
  static async findByRole(roleName) {
    const query = `
      SELECT
        u.id,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.role_id,
        r.name AS role,
        u.status,
        u.last_login,
        u.created_at
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name = $1
        AND u.status != 'deleted'
    `;
    try {
      const result = await db.query(query, [roleName]);
      return result.rows;
    } catch (error) {
      logger.error({ err: error, roleName }, 'Error finding users by role');
      throw error;
    }
  }

  /**
   * Find one user matching a query object
   * @param {Object} queryObj
   * @returns {Promise<Object|null>}
   */
  static async findOne(queryObj) {
    try {
      let sqlQuery = `
        SELECT
          u.id,
          u.username,
          u.email,
          u.password_hash,
          u.salt,
          u.first_name,
          u.last_name,
          u.role_id,
          r.name AS role,
          u.status,
          u.failed_login_attempts,
          u.lockout_until,
          u.two_factor_enabled,
          u.two_factor_secret,
          u.force_password_change,
          u.password_last_changed,
          u.password_hash_type
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.status != 'deleted'
      `;
      const conditions = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(queryObj)) {
        if (key === 'role') {
          conditions.push(`r.name = $${paramIndex}`);
        } else {
          conditions.push(`u.${key} = $${paramIndex}`);
        }
        values.push(value);
        paramIndex++;
      }

      if (conditions.length > 0) {
        sqlQuery += ` AND ${conditions.join(' AND ')}`;
      }

      sqlQuery += ' LIMIT 1';
      const result = await db.query(sqlQuery, values);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error, queryObj }, 'Error finding user with custom query');
      throw error;
    }
  }

  /**
   * Validate session token
   * @param {string} token
   * @returns {Promise<Object|null>}
   */
  static async validateSession(token) {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const query = `
        SELECT
          u.id,
          u.username,
          u.email,
          u.first_name,
          u.last_name,
          u.role_id,
          r.name AS role,
          u.status
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        JOIN roles r ON u.role_id = r.id
        WHERE s.token_hash = $1
          AND s.expires_at > NOW()
          AND s.is_valid = true
          AND u.status = 'active'
      `;
      const result = await db.query(query, [tokenHash]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error, tokenPrefix: token ? token.substring(0, 8) : 'N/A' }, 'Error validating session');
      return null;
    }
  }

  /**
   * Create a new user (transactional)
   * @param {Object} userData
   * @returns {Promise<Object>} The created user record
   */
  static async create(userData) {
    const {
      username,
      email,
      password,
      firstName,
      lastName,
      roleId = null,
      role = null,
      forcePasswordChange = false,
      createdBy = null
    } = userData;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Determine role ID from provided role name or use default role if needed
      let userRoleId = roleId;
      if (!userRoleId && role) {
        const roleQuery = 'SELECT id FROM roles WHERE name = $1';
        const roleResult = await client.query(roleQuery, [role]);
        userRoleId = roleResult.rows[0]?.id;
      }
      if (!userRoleId) {
        const defaultRoleQuery = 'SELECT id FROM roles WHERE is_default = true LIMIT 1';
        const roleResult = await client.query(defaultRoleQuery);
        userRoleId = roleResult.rows[0]?.id;
      }

      // Generate salt and hash the password
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 16384,
        timeCost: 3,
        parallelism: 2
      });

      const insertUserQuery = `
        INSERT INTO users (
          username,
          email,
          password_hash,
          salt,
          first_name,
          last_name,
          role_id,
          status,
          force_password_change,
          password_last_changed,
          password_hash_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING
          id,
          username,
          email,
          first_name,
          last_name,
          status,
          created_at
      `;
      const insertUserResult = await client.query(insertUserQuery, [
        username,
        email,
        passwordHash,
        salt,
        firstName,
        lastName,
        userRoleId,
        'active',
        forcePasswordChange,
        forcePasswordChange ? null : new Date(),
        'argon2id'
      ]);

      const newUser = insertUserResult.rows[0];

      // Log user creation
      if (newUser) {
        const auditQuery = `
          INSERT INTO audit_logs (
            user_id,
            action,
            details
          ) VALUES ($1, $2, $3)
        `;
        await client.query(auditQuery, [
          createdBy || null,
          'user.create',
          JSON.stringify({
            created_user_id: newUser.id,
            username: newUser.username,
            timestamp: new Date()
          })
        ]);
      }
await client.query('COMMIT');
return newUser;
} catch (error) {
await client.query('ROLLBACK');
logger.error({ err: error, username: userData?.username }, 'Error creating user');
throw error;
} finally {
client.release();
}
  }

  /**
   * Update user (non-transactional version)
   * @param {Object} userData
   * @returns {Promise<Object|null>} The updated user record or null if not found
   */
  static async update(userData) {
    const { id, ...updateData } = userData;
    if (!id) {
      throw new Error('User ID is required for update.');
    }
    let query = 'UPDATE users SET ';
    const setClauses = ['updated_at = NOW()'];
    const values = [];
    let paramIndex = 1;

    // Build the SET clause dynamically
    for (const [key, value] of Object.entries(updateData)) {
      if (key === 'id') continue;
      // Convert camelCase to snake_case
      const sqlKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      setClauses.push(`${sqlKey} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    query += setClauses.join(', ');
    query += ` WHERE id = $${paramIndex} RETURNING id, username, email, first_name, last_name, status, updated_at`;
    values.push(id);

    try {
      const result = await db.query(query, values);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error, userId: id, updateData }, 'Error updating user');
      throw error;
    }
  }

  /**
   * Change user password (transactional)
   * @param {string} userId
   * @param {string} newPassword
   * @param {string|null} updatedBy
   * @returns {Promise<boolean>}
   */
  static async changePassword(userId, newPassword, updatedBy = null) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const passwordHash = await argon2.hash(newPassword, {
        type: argon2.argon2id,
        memoryCost: 16384,
        timeCost: 3,
        parallelism: 2
      });

      const updatePasswordQuery = `
        UPDATE users
        SET
          password_hash = $1,
          password_hash_type = 'argon2id',
          force_password_change = false,
          password_last_changed = NOW(),
          updated_at = NOW()
        WHERE id = $2
        RETURNING id, username
      `;
      const updateResult = await client.query(updatePasswordQuery, [passwordHash, userId]);
      if (updateResult.rowCount === 0) {
        throw new Error(`User not found: ${userId}`);
      }

      // Log the password change
      const auditQuery = `
        INSERT INTO audit_logs (
          user_id,
          action,
          details
        ) VALUES ($1, $2, $3)
      `;
      await client.query(auditQuery, [
        updatedBy || userId,
        'user.password_change',
        JSON.stringify({
          user_id: userId,
          username: updateResult.rows[0].username,
          timestamp: new Date()
        })
      ]);

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, userId, updatedBy }, 'Error changing user password');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a new session
   * @param {string} userId
   * @param {string} token
   * @param {Object} metadata
   * @returns {Promise<Object>} Session details
   */
  static async createSession(userId, token, metadata = {}) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const query = `
      INSERT INTO sessions (
        user_id,
        token_hash,
        ip_address,
        user_agent,
        expires_at,
        is_valid
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at, expires_at
    `;
    try {
      const result = await db.query(query, [
        userId,
        tokenHash,
        metadata.ipAddress || null,
        metadata.userAgent || null,
        expiresAt,
        true
      ]);
      return {
        ...result.rows[0],
        token // Return original token to caller, never store it in plain text
      };
    } catch (error) {
      logger.error({ err: error, userId, metadata }, 'Error creating session');
      throw error;
    }
  }

  /**
   * Invalidate a session by token
   * @param {string} token
   * @returns {Promise<boolean>} True if session invalidated, false otherwise
   */
  static async invalidateSession(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const query = `
      UPDATE sessions
      SET
        is_valid = false
      WHERE token_hash = $1
      RETURNING id, user_id
    `;
    try {
      const result = await db.query(query, [tokenHash]);
      if (result.rowCount > 0) {
        // Log session invalidation
        await db.query(
          `INSERT INTO audit_logs (user_id, action, details)
           VALUES ($1, $2, $3)`,
          [
            result.rows[0].user_id,
            'user.logout',
            JSON.stringify({
              session_id: result.rows[0].id,
              timestamp: new Date()
            })
          ]
        );
        return true;
      }
      return false;
    } catch (error) {
      logger.error({ err: error, tokenPrefix: token ? token.substring(0, 8) : 'N/A' }, 'Error invalidating session');
      return false;
    }
  }

  /**
   * Generate a recovery code for a user (transactional)
   * @param {string} username
   * @returns {Promise<{username: string, recoveryCode: string, expiresAt: Date}>}
   */
  static async generateRecoveryCode(username) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const userQuery = `
        SELECT id, username
        FROM users
        WHERE username = $1
          AND status = 'active'
      `;
      const userResult = await client.query(userQuery, [username]);
      if (userResult.rows.length === 0) {
        throw new Error('User not found or inactive');
      }
      const user = userResult.rows[0];

      // 8 characters, uppercase hex
      const recoveryCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      const codeHash = crypto.createHash('sha256').update(recoveryCode).digest('hex');

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // valid for 1 hour

      const insertQuery = `
        INSERT INTO password_reset_requests (
          user_id,
          token_hash,
          expires_at
        ) VALUES ($1, $2, $3)
        RETURNING id
      `;
      await client.query(insertQuery, [user.id, codeHash, expiresAt]);

      // Log the generation
      await client.query(
        `INSERT INTO audit_logs (action, details)
         VALUES ($1, $2)`,
        [
          'user.recovery_code_generated',
          JSON.stringify({
            user_id: user.id,
            username: user.username,
            expires_at: expiresAt,
            timestamp: new Date()
          })
        ]
      );

      await client.query('COMMIT');
      return {
        username: user.username,
        recoveryCode,
        expiresAt
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, username }, 'Error generating recovery code');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reset password using a recovery code (transactional)
   * @param {string} username
   * @param {string} recoveryCode
   * @param {string} newPassword
   * @returns {Promise<boolean>}
   */
  static async resetPasswordWithCode(username, recoveryCode, newPassword) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const userQuery = `
        SELECT id
        FROM users
        WHERE username = $1
          AND status = 'active'
      `;
      const userResult = await client.query(userQuery, [username]);
      if (userResult.rows.length === 0) {
        throw new Error('User not found or inactive');
      }
      const userId = userResult.rows[0].id;

      const codeHash = crypto.createHash('sha256').update(recoveryCode).digest('hex');
      const resetQuery = `
        SELECT id
        FROM password_reset_requests
        WHERE user_id = $1
          AND token_hash = $2
          AND expires_at > NOW()
          AND used = false
      `;
      const resetResult = await client.query(resetQuery, [userId, codeHash]);
      if (resetResult.rows.length === 0) {
        throw new Error('Invalid or expired recovery code');
      }

      const resetId = resetResult.rows[0].id;
      const passwordHash = await argon2.hash(newPassword, {
        type: argon2.argon2id,
        memoryCost: 16384,
        timeCost: 3,
        parallelism: 2
      });

      const updateUserQuery = `
        UPDATE users
        SET
          password_hash = $1,
          password_hash_type = 'argon2id',
          force_password_change = false,
          password_last_changed = NOW(),
          updated_at = NOW()
        WHERE id = $2
      `;
      await client.query(updateUserQuery, [passwordHash, userId]);

      // Mark the reset request as used
      await client.query(
        `UPDATE password_reset_requests
         SET used = true, used_at = NOW()
         WHERE id = $1`,
        [resetId]
      );

      // Log password reset
      await client.query(
        `INSERT INTO audit_logs (user_id, action, details)
         VALUES ($1, $2, $3)`,
        [
          userId,
          'user.password_reset',
          JSON.stringify({
            reset_request_id: resetId,
            timestamp: new Date()
          })
        ]
      );

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, username }, 'Error resetting password with code');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Track a failed login attempt
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  static async recordFailedLogin(userId) {
    const query = `
      UPDATE users
      SET
        failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
        lockout_until = CASE
          WHEN COALESCE(failed_login_attempts, 0) + 1 >= 5
            THEN NOW() + INTERVAL '30 minutes'
          ELSE lockout_until
        END
      WHERE id = $1
      RETURNING
        id,
        username,
        failed_login_attempts,
        lockout_until
    `;
    try {
      const result = await db.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      logger.error({ err: error, userId }, 'Error recording failed login');
      throw error;
    }
  }

  /**
   * Reset failed login attempts
   * @param {string} userId
   * @returns {Promise<void>}
   */
  static async resetFailedLogins(userId) {
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
      logger.error({ err: error, userId }, 'Error resetting failed logins');
      throw error;
    }
  }

  /**
   * Enable or disable two-factor authentication
   * @param {string} userId
   * @param {boolean} enabled
   * @param {string|null} secret
   * @returns {Promise<Object|null>} Updated user record or null if not found
   */
  static async setTwoFactorAuth(userId, enabled, secret = null) {
    const query = `
      UPDATE users
      SET
        two_factor_enabled = $1,
        two_factor_secret = $2
      WHERE id = $3
      RETURNING id, username, two_factor_enabled
    `;
    try {
      const result = await db.query(query, [enabled, secret, userId]);
      if (result.rowCount === 0) {
        return null; // user not found
      }
      // Log 2FA status change
      await db.query(
        `INSERT INTO audit_logs (user_id, action, details)
         VALUES ($1, $2, $3)`,
        [
          userId,
          enabled ? 'user.two_factor_enabled' : 'user.two_factor_disabled',
          JSON.stringify({ timestamp: new Date() })
        ]
      );
      return result.rows[0];
    } catch (error) {
      logger.error({ err: error, userId, enabled }, 'Error updating two-factor auth');
      throw error;
    }
  }

  /**
   * Soft-delete a user (transactional)
   * @param {string} userId
   * @param {string} deletedBy
   * @returns {Promise<boolean>}
   */
  static async deleteUser(userId, deletedBy) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Check if user exists
      const userQuery = 'SELECT username FROM users WHERE id = $1';
      const userResult = await client.query(userQuery, [userId]);
      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }
      const username = userResult.rows[0].username;

      // Soft-delete the user
      const deleteQuery = `
        UPDATE users
        SET
          status = 'deleted',
          updated_at = NOW()
        WHERE id = $1
      `;
      await client.query(deleteQuery, [userId]);

      // Invalidate user sessions
      const invalidateSessionsQuery = `
        UPDATE sessions
        SET is_valid = false
        WHERE user_id = $1
      `;
      await client.query(invalidateSessionsQuery, [userId]);

      // Log the deletion
      const auditQuery = `
        INSERT INTO audit_logs (
          user_id,
          action,
          details
        ) VALUES ($1, $2, $3)
      `;
      await client.query(auditQuery, [
        deletedBy,
        'user.delete',
        JSON.stringify({
          deleted_user_id: userId,
          deleted_username: username,
          timestamp: new Date()
        })
      ]);

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, userId, deletedBy }, 'Error deleting user');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = UserModel;
