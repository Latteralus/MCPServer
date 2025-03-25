const db = require('../config/database');

class ChannelModel {
  static DEFAULT_CHANNEL_UUIDS = {
    'general': '00000000-0000-0000-0000-000000000001',
    'announcements': '00000000-0000-0000-0000-000000000002'
  };

  /**
   * Create a new channel and add the creator as a member.
   */
  static async create(channelData, creatorId) {
    const { name, description, isPrivate = false, metadata = {} } = channelData;
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
      if (error.code === '23505') {
        throw new Error('A channel with this name already exists');
      }
      throw error;
    }
  }

  /**
   * Get channel by ID.
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
      GROUP BY c.id, c.name, c.description, c.is_private, c.created_by, c.created_at, c.last_activity, c.archived, c.metadata
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
   * Get channel by ID or name (with default channel support).
   */
  static async getByIdOrName(channelIdOrName) {
    try {
      const lowercaseName = channelIdOrName.toLowerCase();
      const isDefaultChannel = Object.keys(this.DEFAULT_CHANNEL_UUIDS).includes(lowercaseName);
      if (isDefaultChannel) {
        const defaultUuid = this.DEFAULT_CHANNEL_UUIDS[lowercaseName];
        try {
          const channel = await this.getById(defaultUuid);
          if (channel) return channel;
        } catch (uuidError) {
          // Continue to creation
        }
        try {
          const createQuery = `
            INSERT INTO channels (
              id, name, description, is_private, created_by, metadata
            ) VALUES ($1, $2, $3, false, 'system', $4)
            ON CONFLICT (id) DO UPDATE 
            SET name = EXCLUDED.name, description = EXCLUDED.description
            RETURNING id, name, description, is_private, created_at, last_activity, archived, metadata
          `;
          const capitalizedName = lowercaseName.charAt(0).toUpperCase() + lowercaseName.slice(1);
          const result = await db.query(createQuery, [
            defaultUuid,
            capitalizedName,
            `Default ${lowercaseName} channel`,
            JSON.stringify({})
          ]);
          if (result.rows.length > 0) return result.rows[0];
        } catch (createError) {
          console.error(`Error creating default channel ${lowercaseName}:`, createError);
        }
      }
      let channel = null;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelIdOrName);
      if (isUuid) {
        try {
          channel = await this.getById(channelIdOrName);
          if (channel) return channel;
        } catch (error) {
          // Continue to name search
        }
      }
      const nameQuery = `
        SELECT 
          c.id, c.name, c.description, c.is_private, c.created_by,
          c.created_at, c.last_activity, c.archived, c.metadata,
          COUNT(cm.user_id) AS member_count
        FROM channels c
        LEFT JOIN channel_members cm ON c.id = cm.channel_id
        WHERE LOWER(c.name) = LOWER($1)
        GROUP BY c.id, c.name, c.description, c.is_private, c.created_by, c.created_at, c.last_activity, c.archived, c.metadata
        LIMIT 1
      `;
      const nameResult = await db.query(nameQuery, [channelIdOrName]);
      if (nameResult.rows.length > 0) return nameResult.rows[0];
      const partialQuery = `
        SELECT 
          c.id, c.name, c.description, c.is_private, c.created_by,
          c.created_at, c.last_activity, c.archived, c.metadata,
          COUNT(cm.user_id) AS member_count
        FROM channels c
        LEFT JOIN channel_members cm ON c.id = cm.channel_id
        WHERE c.name ILIKE $1
        GROUP BY c.id, c.name, c.description, c.is_private, c.created_by, c.created_at, c.last_activity, c.archived, c.metadata
        LIMIT 1
      `;
      const partialResult = await db.query(partialQuery, [`%${channelIdOrName}%`]);
      if (partialResult.rows.length > 0) return partialResult.rows[0];
      return null;
    } catch (error) {
      console.error('Error in getByIdOrName:', error);
      throw error;
    }
  }

  /**
   * Update a channel within a transaction.
   */
  static async updateWithClient(client, channelId, updateData) {
    const { name, description, isPrivate, archived, metadata } = updateData;
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
    const result = await client.query(query, [
      name,
      description,
      isPrivate,
      archived,
      metadata ? JSON.stringify(metadata) : null,
      channelId
    ]);
    if (result.rowCount === 0) {
      throw new Error('Channel not found');
    }
    return result.rows[0];
  }

  /**
   * Update a channel (non-transactional version).
   */
  static async update(channelId, updateData) {
    const { name, description, isPrivate, archived, metadata } = updateData;
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
   * Delete a channel (only if no messages exist).
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
   * Add a member to a channel.
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
   * Remove a member from a channel.
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
   * Get members of a channel.
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
   * Search for channels.
   */
  static async search(searchParams = {}) {
    const { name, isPrivate, createdBy, limit = 50, offset = 0 } = searchParams;
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
   * Update channel's last activity timestamp.
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
   * Check if a user is a member of a channel.
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
