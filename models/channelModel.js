const db = require('../config/database');

class ChannelModel {
  /**
   * Create a new channel
   * @param {Object} channelData - Channel creation data
   * @param {string} creatorId - ID of the user creating the channel
   * @returns {Promise<Object>} Created channel details
   */
  static async create(channelData, creatorId) {
    const { 
      name, 
      description, 
      isPrivate = false, 
      metadata = {} 
    } = channelData;

    const query = `
      INSERT INTO channels (
        name, 
        description, 
        is_private, 
        created_by, 
        metadata
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, description, is_private, created_at
    `;

    try {
      const result = await db.query(query, [
        name, 
        description, 
        isPrivate, 
        creatorId, 
        JSON.stringify(metadata)
      ]);

      const channel = result.rows[0];

      // Automatically add creator as channel member
      await this.addMember(channel.id, creatorId, 'admin');

      return channel;
    } catch (error) {
      // Handle unique constraint violations
      if (error.code === '23505') {
        throw new Error('A channel with this name already exists');
      }
      throw error;
    }
  }

  /**
   * Get channel by ID
   * @param {string} channelId - Channel ID
   * @returns {Promise<Object>} Channel details
   */
  static async getById(channelId) {
    const query = `
      SELECT 
        c.id, 
        c.name, 
        c.description, 
        c.is_private, 
        c.created_by,
        c.created_at,
        c.last_activity,
        c.archived,
        c.metadata,
        COUNT(cm.user_id) AS member_count
      FROM channels c
      LEFT JOIN channel_members cm ON c.id = cm.channel_id
      WHERE c.id = $1
      GROUP BY 
        c.id, 
        c.name, 
        c.description, 
        c.is_private, 
        c.created_by,
        c.created_at,
        c.last_activity,
        c.archived,
        c.metadata
    `;

    try {
      const result = await db.query(query, [channelId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error fetching channel:', error);
      throw error;
    }
  }

  /**
   * Update a channel
   * @param {string} channelId - Channel ID
   * @param {Object} updateData - Channel update data
   * @returns {Promise<Object>} Updated channel details
   */
  static async update(channelId, updateData) {
    const { 
      name, 
      description, 
      isPrivate, 
      archived, 
      metadata 
    } = updateData;

    const query = `
      UPDATE channels
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        is_private = COALESCE($3, is_private),
        archived = COALESCE($4, archived),
        metadata = COALESCE($5, metadata)
      WHERE id = $6
      RETURNING id, name, description, is_private, archived, metadata
    `;

    try {
      const result = await db.query(query, [
        name, 
        description, 
        isPrivate, 
        archived, 
        metadata ? JSON.stringify(metadata) : null, 
        channelId
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('Error updating channel:', error);
      throw error;
    }
  }

  /**
   * Delete a channel
   * @param {string} channelId - Channel ID
   * @returns {Promise<boolean>} Deletion success status
   */
  static async delete(channelId) {
    const query = `
      DELETE FROM channels
      WHERE id = $1
      AND NOT EXISTS (
        SELECT 1 FROM messages WHERE channel_id = $1
      )
    `;

    try {
      const result = await db.query(query, [channelId]);
      
      if (result.rowCount === 0) {
        throw new Error('Cannot delete channel: Messages exist in this channel');
      }

      return true;
    } catch (error) {
      console.error('Error deleting channel:', error);
      throw error;
    }
  }

  /**
   * Add a member to a channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User ID
   * @param {string} role - Member role (default: 'member')
   * @returns {Promise<Object>} Channel membership details
   */
  static async addMember(channelId, userId, role = 'member') {
    const query = `
      INSERT INTO channel_members (channel_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (channel_id, user_id) DO UPDATE 
      SET role = EXCLUDED.role
      RETURNING channel_id, user_id, role, joined_at
    `;

    try {
      const result = await db.query(query, [channelId, userId, role]);
      return result.rows[0];
    } catch (error) {
      console.error('Error adding channel member:', error);
      throw error;
    }
  }

  /**
   * Remove a member from a channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Removal success status
   */
  static async removeMember(channelId, userId) {
    const query = `
      DELETE FROM channel_members
      WHERE channel_id = $1 AND user_id = $2
    `;

    try {
      await db.query(query, [channelId, userId]);
      return true;
    } catch (error) {
      console.error('Error removing channel member:', error);
      throw error;
    }
  }

  /**
   * Get channel members
   * @param {string} channelId - Channel ID
   * @param {Object} options - Query options
   * @returns {Promise<Object[]>} Channel members
   */
  static async getMembers(channelId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const query = `
      SELECT 
        u.id, 
        u.username, 
        u.email, 
        cm.role,
        cm.joined_at
      FROM channel_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.channel_id = $1
      LIMIT $2 OFFSET $3
    `;

    try {
      const result = await db.query(query, [channelId, limit, offset]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching channel members:', error);
      throw error;
    }
  }

  /**
   * Search channels
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Object[]>} List of channels
   */
  static async search(searchParams = {}) {
    const { 
      name, 
      isPrivate, 
      createdBy, 
      limit = 50, 
      offset = 0 
    } = searchParams;

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      conditions.push(`name ILIKE $${paramIndex}`);
      values.push(`%${name}%`);
      paramIndex++;
    }

    if (isPrivate !== undefined) {
      conditions.push(`is_private = $${paramIndex}`);
      values.push(isPrivate);
      paramIndex++;
    }

    if (createdBy) {
      conditions.push(`created_by = $${paramIndex}`);
      values.push(createdBy);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        id, 
        name, 
        description, 
        is_private, 
        created_by, 
        created_at,
        last_activity,
        archived,
        (SELECT COUNT(*) FROM channel_members WHERE channel_id = channels.id) as member_count
      FROM channels
      ${whereClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    values.push(limit, offset);

    try {
      const result = await db.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error searching channels:', error);
      throw error;
    }
  }

  /**
   * Update channel last activity timestamp
   * @param {string} channelId - Channel ID
   * @returns {Promise<void>}
   */
  static async updateLastActivity(channelId) {
    const query = `
      UPDATE channels
      SET last_activity = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    try {
      await db.query(query, [channelId]);
    } catch (error) {
      console.error('Error updating channel last activity:', error);
      throw error;
    }
  }

  /**
   * Check if a user is a member of a channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Membership status
   */
  static async isMember(channelId, userId) {
    const query = `
      SELECT EXISTS (
        SELECT 1 
        FROM channel_members
        WHERE channel_id = $1 AND user_id = $2
      ) AS is_member
    `;

    try {
      const result = await db.query(query, [channelId, userId]);
      return result.rows[0].is_member;
    } catch (error) {
      console.error('Error checking channel membership:', error);
      throw error;
    }
  }
}

module.exports = ChannelModel;