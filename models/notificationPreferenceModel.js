// MCPServer/models/notificationPreferenceModel.js
const db = require('../config/database');
const logger = require('../config/logger');

class NotificationPreferenceModel {

  /**
   * Get all notification preferences for a user.
   * @param {string} userId - The ID of the user.
   * @returns {Promise<Array<Object>>} List of preference objects.
   */
  static async getByUserId(userId) {
    const query = `
      SELECT user_id, context_type, context_id, notification_level, updated_at
      FROM user_notification_preferences
      WHERE user_id = $1
    `;
    try {
      const result = await db.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error({ err: error, userId }, 'Error fetching notification preferences by user ID');
      throw error;
    }
  }

  /**
   * Get a specific notification preference for a user and context.
   * @param {string} userId - The ID of the user.
   * @param {string} contextType - 'global', 'channel', or 'dm'.
   * @param {string|null} contextId - Channel ID, other User ID, or NULL for global.
   * @returns {Promise<Object|null>} The preference object or null if not set.
   */
  static async getSpecificPreference(userId, contextType, contextId) {
    // Handle NULL contextId correctly in the query
    const contextIdCondition = contextId === null ? 'context_id IS NULL' : 'context_id = $3';
    const query = `
      SELECT user_id, context_type, context_id, notification_level, updated_at
      FROM user_notification_preferences
      WHERE user_id = $1 AND context_type = $2 AND ${contextIdCondition}
    `;
    const params = contextId === null ? [userId, contextType] : [userId, contextType, contextId];

    try {
      const result = await db.query(query, params);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error, userId, contextType, contextId }, 'Error fetching specific notification preference');
      throw error;
    }
  }

  /**
   * Set or update a notification preference for a user.
   * Uses ON CONFLICT to handle both insert and update.
   * @param {string} userId - The ID of the user.
   * @param {string} contextType - 'global', 'channel', or 'dm'.
   * @param {string|null} contextId - Channel ID, other User ID, or NULL for global.
   * @param {string} notificationLevel - 'all', 'mentions', or 'none'.
   * @returns {Promise<Object>} The created or updated preference object.
   */
  static async setPreference(userId, contextType, contextId, notificationLevel) {
    // Validate notificationLevel
    const validLevels = ['all', 'mentions', 'none'];
    if (!validLevels.includes(notificationLevel)) {
        throw new Error(`Invalid notification level: ${notificationLevel}. Must be one of ${validLevels.join(', ')}.`);
    }
     // Validate contextType
    const validContextTypes = ['global', 'channel', 'dm'];
     if (!validContextTypes.includes(contextType)) {
        throw new Error(`Invalid context type: ${contextType}. Must be one of ${validContextTypes.join(', ')}.`);
    }
    // Ensure contextId is null for global type
    if (contextType === 'global' && contextId !== null) {
        logger.warn({ userId, contextType, contextId }, 'Context ID must be NULL for global notification preferences. Setting contextId to NULL.');
        contextId = null;
    }
     // Ensure contextId is not null for channel/dm types (basic check)
     if ((contextType === 'channel' || contextType === 'dm') && contextId === null) {
        throw new Error(`Context ID cannot be NULL for context type: ${contextType}.`);
    }


    const query = `
      INSERT INTO user_notification_preferences (user_id, context_type, context_id, notification_level, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id, context_type, context_id)
      DO UPDATE SET
        notification_level = EXCLUDED.notification_level,
        updated_at = NOW()
      RETURNING user_id, context_type, context_id, notification_level, updated_at
    `;
    try {
      const result = await db.query(query, [userId, contextType, contextId, notificationLevel]);
      logger.info({ preference: result.rows[0] }, 'Notification preference set/updated successfully');
      return result.rows[0];
    } catch (error) {
      logger.error({ err: error, userId, contextType, contextId, notificationLevel }, 'Error setting notification preference');
      // Add specific checks? e.g., foreign key violation if contextId doesn't exist?
      throw error;
    }
  }

   /**
   * Delete a specific notification preference (resets to default behavior).
   * @param {string} userId - The ID of the user.
   * @param {string} contextType - 'global', 'channel', or 'dm'.
   * @param {string|null} contextId - Channel ID, other User ID, or NULL for global.
   * @returns {Promise<boolean>} True if a preference was deleted, false otherwise.
   */
  static async deletePreference(userId, contextType, contextId) {
    const contextIdCondition = contextId === null ? 'context_id IS NULL' : 'context_id = $3';
    const query = `
      DELETE FROM user_notification_preferences
      WHERE user_id = $1 AND context_type = $2 AND ${contextIdCondition}
    `;
    const params = contextId === null ? [userId, contextType] : [userId, contextType, contextId];

    try {
      const result = await db.query(query, params);
      const deleted = result.rowCount > 0;
      if (deleted) {
          logger.info({ userId, contextType, contextId }, 'Notification preference deleted successfully');
      } else {
          logger.warn({ userId, contextType, contextId }, 'Attempted to delete non-existent notification preference');
      }
      return deleted;
    } catch (error) {
      logger.error({ err: error, userId, contextType, contextId }, 'Error deleting notification preference');
      throw error;
    }
  }

}

module.exports = NotificationPreferenceModel;