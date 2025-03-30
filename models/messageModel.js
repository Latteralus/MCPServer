const db = require('../config/database');
const crypto = require('crypto');
const EncryptionService = require('../services/encryptionService'); // Added
const logger = require('../config/logger'); // Import logger

// Instantiate the service to use its methods and loaded keys
const encryptionService = new EncryptionService();

class MessageModel {
  static async create(messageData) {
    const { 
      channelId, 
      senderId, 
      text, 
      metadata = {}, 
      containsPHI = false 
    } = messageData;

    const encryptedText = containsPHI 
      ? this.encryptMessage(text) 
      : null;

    const query = `
      INSERT INTO messages (
        channel_id, 
        sender_id, 
        text, 
        encrypted_text,
        metadata,
        contains_phi
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, channel_id, sender_id, text, timestamp, contains_phi
    `;

    try {
      const result = await db.query(query, [
        channelId,
        senderId,
        null, // Always store NULL in plaintext 'text' column for HIPAA compliance
        encryptedText, // Rely solely on encrypted_text
        JSON.stringify(metadata),
        containsPHI // Keep flag for potential filtering/reporting, even if text is always encrypted
      ]);
      return result.rows[0];
    } catch (error) {
      logger.error({ err: error, messageData }, 'Error creating message');
      throw error;
    }
  }

  /**
   * Create a new message within a transaction.
   * @param {Object} client - Database client from a transaction.
   * @param {Object} messageData - Message creation data.
   * @returns {Promise<Object>} Created message details.
   */
  static async createWithClient(client, messageData) {
    const { 
      channelId, 
      senderId, 
      text, 
      metadata = {}, 
      containsPHI = false 
    } = messageData;

    const encryptedText = containsPHI 
      ? this.encryptMessage(text) 
      : null;

    const query = `
      INSERT INTO messages (
        channel_id, 
        sender_id, 
        text, 
        encrypted_text,
        metadata,
        contains_phi
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, channel_id, sender_id, text, timestamp, contains_phi
    `;

    try {
      const result = await client.query(query, [
        channelId, 
        senderId, 
        containsPHI ? null : text,
        encryptedText,
        JSON.stringify(metadata),
        containsPHI
      ]);
      return result.rows[0];
    } catch (error) {
      logger.error({ err: error, messageData }, 'Error creating message with client');
      throw error;
    }
  }

  static async getById(messageId, userId) {
    const query = `
      SELECT 
        m.id, 
        m.channel_id, 
        m.sender_id,
        u.username AS sender_username,
        CASE 
          WHEN m.contains_phi AND m.encrypted_text IS NOT NULL 
          THEN NULL 
          ELSE m.text 
        END AS text,
        m.timestamp,
        m.edited_at,
        m.deleted,
        m.deleted_at,
        m.flagged,
        m.flag_reason,
        m.contains_phi,
        m.metadata,
        cm.user_id IS NOT NULL AS is_channel_member
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN channel_members cm ON m.channel_id = cm.channel_id AND cm.user_id = $2
      WHERE m.id = $1
    `;
    try {
      const result = await db.query(query, [messageId, userId]);
      const message = result.rows[0];
      if (!message) {
        return null;
      }
      if (message.contains_phi && message.is_channel_member) {
        message.text = this.decryptMessage(message.encrypted_text);
      }
      return message;
    } catch (error) {
      logger.error({ err: error, messageId, userId }, 'Error fetching message by ID');
      throw error;
    }
  }

  /**
   * Update a message within a transaction.
   * @param {Object} client - Database client from a transaction.
   * @param {string} messageId - Message ID.
   * @param {string} userId - User ID updating the message.
   * @param {Object} updateData - Message update data.
   * @returns {Promise<Object>} Updated message details.
   */
  static async updateWithClient(client, messageId, userId, updateData) {
    const { text, metadata } = updateData;
    const query = `
      UPDATE messages
      SET 
        text = COALESCE($1, text),
        metadata = COALESCE($2, metadata),
        edited_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND sender_id = $4
      RETURNING id, text, edited_at
    `;
    const result = await client.query(query, [
      text, 
      metadata ? JSON.stringify(metadata) : null, 
      messageId, 
      userId
    ]);
    if (result.rowCount === 0) {
      throw new Error('Message not found or user not authorized');
    }
    return result.rows[0];
  }

  static async update(messageId, userId, updateData) {
    const { text, metadata } = updateData;
    const query = `
      UPDATE messages
      SET 
        text = COALESCE($1, text),
        metadata = COALESCE($2, metadata),
        edited_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND sender_id = $4
      RETURNING id, text, edited_at
    `;
    try {
      const result = await db.query(query, [
        text, 
        metadata ? JSON.stringify(metadata) : null, 
        messageId, 
        userId
      ]);
      if (result.rowCount === 0) {
        throw new Error('Message not found or user not authorized');
      }
      return result.rows[0];
    } catch (error) {
      logger.error({ err: error, messageId, userId, updateData }, 'Error updating message');
      throw error;
    }
  }

  static async delete(messageId, userId, permanent = false) {
    if (permanent) {
      const permanentQuery = `
        DELETE FROM messages
        WHERE id = $1 AND sender_id = $2
        RETURNING id
      `;
      try {
        const result = await db.query(permanentQuery, [messageId, userId]);
        if (result.rowCount === 0) {
          throw new Error('Message not found or user not authorized');
        }
        return { id: messageId, deleted: true, permanent: true };
      } catch (error) {
        logger.error({ err: error, messageId, userId }, 'Error permanently deleting message');
        throw error;
      }
    } else {
      const softDeleteQuery = `
        UPDATE messages
        SET 
          deleted = true, 
          deleted_at = CURRENT_TIMESTAMP,
          text = NULL
        WHERE id = $1 AND sender_id = $2
        RETURNING id, deleted_at
      `;
      try {
        const result = await db.query(softDeleteQuery, [messageId, userId]);
        if (result.rowCount === 0) {
          throw new Error('Message not found or user not authorized');
        }
        return result.rows[0];
      } catch (error) {
        logger.error({ err: error, messageId, userId }, 'Error soft deleting message');
        throw error;
      }
    }
  }

  static async flag(messageId, userId, flagData) {
    const { reason, details = {} } = flagData;
    const query = `
      UPDATE messages
      SET 
        flagged = true, 
        flag_reason = $1,
        flagged_by = $2,
        flagged_at = CURRENT_TIMESTAMP,
        metadata = COALESCE(metadata, '{}') || $3
      WHERE id = $4
      RETURNING id, flagged, flag_reason, flagged_at
    `;
    try {
      const result = await db.query(query, [
        reason, 
        userId, 
        JSON.stringify(details), 
        messageId
      ]);
      if (result.rowCount === 0) {
        throw new Error('Message not found');
      }
      return result.rows[0];
    } catch (error) {
      logger.error({ err: error, messageId, userId, flagData }, 'Error flagging message');
      throw error;
    }
  }

  static async search(searchParams = {}) {
    const { 
      channelId, 
      senderId, 
      startDate, 
      endDate, 
      containsPHI,
      flagged,
      deleted,
      limit = 50, 
      offset = 0 
    } = searchParams;

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (channelId) {
      conditions.push(`channel_id = $${paramIndex}`);
      values.push(channelId);
      paramIndex++;
    }
    if (senderId) {
      conditions.push(`sender_id = $${paramIndex}`);
      values.push(senderId);
      paramIndex++;
    }
    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex}`);
      values.push(new Date(startDate));
      paramIndex++;
    }
    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex}`);
      values.push(new Date(endDate));
      paramIndex++;
    }
    if (containsPHI !== undefined) {
      conditions.push(`contains_phi = $${paramIndex}`);
      values.push(containsPHI);
      paramIndex++;
    }
    if (flagged !== undefined) {
      conditions.push(`flagged = $${paramIndex}`);
      values.push(flagged);
      paramIndex++;
    }
    if (deleted !== undefined) {
      conditions.push(`deleted = $${paramIndex}`);
      values.push(deleted);
      paramIndex++;
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT 
        m.id, 
        m.channel_id, 
        m.sender_id,
        u.username AS sender_username,
        CASE 
          WHEN m.contains_phi THEN NULL ELSE m.text 
        END AS text,
        m.timestamp,
        m.edited_at,
        m.deleted,
        m.flagged,
        m.contains_phi
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      ${whereClause}
      ORDER BY m.timestamp DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(limit, offset);
    try {
      const result = await db.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error({ err: error, searchParams }, 'Error searching messages');
      throw error;
    }
  }

  /**
   * Encrypt message text using the centralized EncryptionService (AES-GCM).
   * @param {string} text - Plaintext message.
   * @returns {string} JSON string containing iv, authTag, and encryptedData.
   */
  static encryptMessage(text) {
    try {
      // Use the instantiated encryptionService which holds the persistent keys
      const encryptedPayload = encryptionService.encrypt(text);
      // Store iv, authTag, and encryptedData together as a JSON string
      // Note: DB schema might need adjustment if BYTEA was intended for raw encrypted bytes + IV/tag separately.
      return JSON.stringify(encryptedPayload);
    } catch (error) {
      logger.error({ err: error }, 'Message encryption failed');
      // Depending on policy, might re-throw or return null/indicator of failure
      throw new Error('Failed to encrypt message');
    }
  }

  /**
   * Decrypt message text using the centralized EncryptionService (AES-GCM).
   * @param {string} encryptedJsonString - JSON string containing iv, authTag, and encryptedData.
   * @returns {string} Decrypted plaintext message.
   */
  static decryptMessage(encryptedJsonString) {
    if (!encryptedJsonString) {
      logger.warn('Attempted to decrypt null or empty data.');
      return ''; // Or handle as appropriate
    }
    try {
      // Parse the stored JSON string
      const encryptedPayload = JSON.parse(encryptedJsonString);
      // Use the instantiated encryptionService to decrypt
      return encryptionService.decrypt(encryptedPayload);
    } catch (error) {
      logger.error({ err: error }, 'Message decryption failed');
      // Depending on policy, might re-throw or return placeholder/indicator of failure
      // Avoid returning the encrypted data on failure.
      // Avoid returning the encrypted data on failure.
      return '[Decryption Failed]';
    }
  } // End of decryptMessage function
} // End of MessageModel class

module.exports = MessageModel;
