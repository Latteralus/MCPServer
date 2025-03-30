const db = require('../config/database');
const logger = require('../config/logger'); // Import logger

class RoleModel {
  /**
   * Create a new role
   * @param {Object} roleData - Role creation data
   * @returns {Promise<Object>} Created role details
   */
  static async create(roleData) {
    const { name, description, isDefault = false } = roleData;

    const query = `
      INSERT INTO roles (name, description, is_default)
      VALUES ($1, $2, $3)
      RETURNING id, name, description, is_default, created_at
    `;

    try {
      const result = await db.query(query, [name, description, isDefault]);
      return result.rows[0];
    } catch (error) {
      // Handle unique constraint violations
      if (error.code === '23505') {
        throw new Error('Role with this name already exists');
      }
      throw error;
    }
  }

  /**
   * Get role by ID
   * @param {string} roleId - Role ID
   * @returns {Promise<Object>} Role details
   */
  static async getById(roleId) {
    const query = `
      SELECT id, name, description, is_default, created_at
      FROM roles
      WHERE id = $1
    `;

    try {
      const result = await db.query(query, [roleId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error, roleId }, 'Error fetching role by ID');
      throw error;
    }
  }

  /**
   * Get role by name
   * @param {string} roleName - Role name
   * @returns {Promise<Object>} Role details
   */
  static async getByName(roleName) {
    const query = `
      SELECT id, name, description, is_default, created_at
      FROM roles
      WHERE name = $1
    `;

    try {
      const result = await db.query(query, [roleName]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error, roleName }, 'Error fetching role by name');
      throw error;
    }
  }

  /**
   * Update a role
   * @param {string} roleId - Role ID
   * @param {Object} updateData - Role update data
   * @returns {Promise<Object>} Updated role details
   */
  static async update(roleId, updateData) {
    const { name, description, isDefault } = updateData;

    const query = `
      UPDATE roles
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        is_default = COALESCE($3, is_default)
      WHERE id = $4
      RETURNING id, name, description, is_default
    `;

    try {
      const result = await db.query(query, [
        name, 
        description, 
        isDefault, 
        roleId
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error, roleId, updateData }, 'Error updating role');
      throw error;
    }
  }

  /**
   * Delete a role
   * @param {string} roleId - Role ID
   * @returns {Promise<boolean>} Deletion success status
   */
  static async delete(roleId) {
    const query = `
      DELETE FROM roles
      WHERE id = $1
      AND NOT EXISTS (
        SELECT 1 FROM users WHERE role_id = $1
      )
    `;

    try {
      const result = await db.query(query, [roleId]);
      
      if (result.rowCount === 0) {
        throw new Error('Cannot delete role: Users exist with this role');
      }

      return true;
    } catch (error) {
      logger.error({ err: error, roleId }, 'Error deleting role');
      throw error;
    }
  }

  /**
   * Add permissions to a role
   * @param {string} roleId - Role ID
   * @param {string[]} permissionIds - Array of permission IDs
   * @returns {Promise<Object[]>} Added role permissions
   */
  static async addPermissions(roleId, permissionIds) {
    // Validate role exists
    const roleExists = await this.getById(roleId);
    if (!roleExists) {
      throw new Error('Role not found');
    }

    const query = `
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES ${permissionIds.map((_, idx) => `($1, $${idx + 2})`).join(', ')}
      ON CONFLICT (role_id, permission_id) DO NOTHING
      RETURNING permission_id
    `;

    try {
      const result = await db.query(query, [roleId, ...permissionIds]);
      return result.rows;
    } catch (error) {
      logger.error({ err: error, roleId, permissionIds }, 'Error adding permissions to role');
      throw error;
    }
  }

  /**
   * Remove permissions from a role
   * @param {string} roleId - Role ID
   * @param {string[]} permissionIds - Array of permission IDs
   * @returns {Promise<Object[]>} Removed role permissions
   */
  static async removePermissions(roleId, permissionIds) {
    const query = `
      DELETE FROM role_permissions
      WHERE role_id = $1 
      AND permission_id = ANY($2)
      RETURNING permission_id
    `;

    try {
      const result = await db.query(query, [roleId, permissionIds]);
      return result.rows;
    } catch (error) {
      logger.error({ err: error, roleId, permissionIds }, 'Error removing permissions from role');
      throw error;
    }
  }

  /**
   * Get all permissions for a role
   * @param {string} roleId - Role ID
   * @returns {Promise<Object[]>} Role permissions
   */
  static async getPermissions(roleId) {
    const query = `
      SELECT 
        p.id, 
        p.name, 
        p.description, 
        p.category
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = $1
    `;

    try {
      const result = await db.query(query, [roleId]);
      return result.rows;
    } catch (error) {
      logger.error({ err: error, roleId }, 'Error fetching role permissions');
      throw error;
    }
  }

  /**
   * List all roles
   * @param {Object} options - List options
   * @returns {Promise<Object[]>} List of roles
   */
  static async list(options = {}) {
    const { limit = 50, offset = 0 } = options;

    const query = `
      SELECT 
        id, 
        name, 
        description, 
        is_default, 
        created_at
      FROM roles
      LIMIT $1 OFFSET $2
    `;

    try {
      const result = await db.query(query, [limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error({ err: error, options }, 'Error listing roles');
      throw error;
    }
  }

  /**
   * Check if a role has a specific permission
   * @param {string} roleId - Role ID
   * @param {string} permissionName - Permission name
   * @returns {Promise<boolean>} Permission status
   */
  static async hasPermission(roleId, permissionName) {
    const query = `
      SELECT EXISTS (
        SELECT 1 
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = $1 AND p.name = $2
      ) AS has_permission
    `;

    try {
      const result = await db.query(query, [roleId, permissionName]);
      return result.rows[0].has_permission;
    } catch (error) {
      logger.error({ err: error, roleId, permissionName }, 'Error checking role permission');
      throw error;
    }
  }
}

module.exports = RoleModel;