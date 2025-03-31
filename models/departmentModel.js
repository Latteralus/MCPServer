// MCPServer/models/departmentModel.js
const db = require('../config/database');
const logger = require('../config/logger');

class DepartmentModel {
  /**
   * Create a new department
   * @param {Object} departmentData - Department data { name, description }
   * @returns {Promise<Object>} Created department details
   */
  static async create(departmentData) {
    const { name, description } = departmentData;
    const query = `
      INSERT INTO departments (name, description)
      VALUES ($1, $2)
      RETURNING id, name, description, created_at
    `;
    try {
      const result = await db.query(query, [name, description]);
      logger.info({ department: result.rows[0] }, 'Department created successfully');
      return result.rows[0];
    } catch (error) {
      logger.error({ err: error, departmentData }, 'Error creating department');
      if (error.code === '23505') { // unique_violation for name
        throw new Error('Department with this name already exists');
      }
      throw error;
    }
  }

  /**
   * Get department by ID
   * @param {string} departmentId - Department ID
   * @returns {Promise<Object|null>} Department details or null if not found
   */
  static async getById(departmentId) {
    const query = `
      SELECT id, name, description, created_at
      FROM departments
      WHERE id = $1
    `;
    try {
      const result = await db.query(query, [departmentId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error, departmentId }, 'Error fetching department by ID');
      throw error;
    }
  }

  /**
   * Get department by name
   * @param {string} departmentName - Department name
   * @returns {Promise<Object|null>} Department details or null if not found
   */
  static async getByName(departmentName) {
    const query = `
      SELECT id, name, description, created_at
      FROM departments
      WHERE name = $1
    `;
    try {
      const result = await db.query(query, [departmentName]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error, departmentName }, 'Error fetching department by name');
      throw error;
    }
  }

  /**
   * Update a department
   * @param {string} departmentId - Department ID
   * @param {Object} updateData - Department update data { name, description }
   * @returns {Promise<Object|null>} Updated department details or null if not found
   */
  static async update(departmentId, updateData) {
    const { name, description } = updateData;
    const query = `
      UPDATE departments
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description)
      WHERE id = $3
      RETURNING id, name, description, created_at
    `;
    try {
      const result = await db.query(query, [name, description, departmentId]);
      if (result.rowCount === 0) {
        return null; // Department not found
      }
      logger.info({ departmentId, updateData }, 'Department updated successfully');
      return result.rows[0];
    } catch (error) {
      logger.error({ err: error, departmentId, updateData }, 'Error updating department');
      if (error.code === '23505') { // unique_violation for name
        throw new Error('Another department with this name already exists');
      }
      throw error;
    }
  }

  /**
   * Delete a department
   * @param {string} departmentId - Department ID
   * @returns {Promise<boolean>} Deletion success status (true if deleted, false if not found or users assigned)
   */
  static async delete(departmentId) {
    // Check if any users are assigned to this department first
    const userCheckQuery = 'SELECT 1 FROM users WHERE department_id = $1 LIMIT 1';
    try {
      const userCheckResult = await db.query(userCheckQuery, [departmentId]);
      if (userCheckResult.rowCount > 0) {
        logger.warn({ departmentId }, 'Attempted to delete department with assigned users.');
        throw new Error('Cannot delete department: Users are assigned to it.');
      }

      // Proceed with deletion if no users are assigned
      const deleteQuery = 'DELETE FROM departments WHERE id = $1';
      const result = await db.query(deleteQuery, [departmentId]);

      if (result.rowCount > 0) {
        logger.info({ departmentId }, 'Department deleted successfully');
        return true;
      } else {
        logger.warn({ departmentId }, 'Attempted to delete non-existent department.');
        return false; // Department not found
      }
    } catch (error) {
      // Log the original error unless it's the specific user assignment error we threw
      if (error.message !== 'Cannot delete department: Users are assigned to it.') {
          logger.error({ err: error, departmentId }, 'Error during department deletion process');
      }
      throw error; // Re-throw the error for the controller to handle
    }
  }

  /**
   * List all departments
   * @param {Object} options - List options { limit, offset }
   * @returns {Promise<Object[]>} List of departments
   */
  static async list(options = {}) {
    const { limit = 100, offset = 0 } = options; // Default limit
    const query = `
      SELECT id, name, description, created_at
      FROM departments
      ORDER BY name ASC
      LIMIT $1 OFFSET $2
    `;
    try {
      const result = await db.query(query, [limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error({ err: error, options }, 'Error listing departments');
      throw error;
    }
  }
}

module.exports = DepartmentModel;