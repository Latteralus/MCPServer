const db = require('../config/database');
const crypto = require('crypto');

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
        containsPHI ? null : text,
        encryptedText,
        JSON.stringify(metadata),
        containsPHI
      ]);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating message:', error);
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
      console.error('Error creating message with client:', error);
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
      console.error('Error fetching message:', error);
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
      console.error('Error updating message:', error);
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
        console.error('Error permanently deleting message:', error);
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
        console.error('Error soft deleting message:', error);
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
      console.error('Error flagging message:', error);
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
      console.error('Error searching messages:', error);
      throw error;
    }
  }

  static encryptMessage(text) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return JSON.stringify({
      key: key.toString('hex'),
      iv: iv.toString('hex'),
      text: encrypted
    });
  }

  static decryptMessage(encryptedData) {
    try {
      const algorithm = 'aes-256-cbc';
      const { key, iv, text } = JSON.parse(encryptedData);
      const decipher = crypto.createDecipheriv(
        algorithm, 
        Buffer.from(key, 'hex'), 
        Buffer.from(iv, 'hex')
      );
      let decrypted = decipher.update(text, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Error decrypting message:', error);
      return null;
    }
  }
}

module.exports = MessageModel;
