const db = require('../config/database');

class AuditModel {
  /**
   * Log an action for audit purposes
   * @param {Object} logData - Audit log entry data
   * @returns {Promise<Object>} Created audit log entry
   */
  static async log(logData) {
    const { 
      userId = null, 
      action, 
      details = {}, 
      ipAddress = null, 
      userAgent = null 
    } = logData;

    const query = `
      INSERT INTO audit_logs (
        user_id, 
        action, 
        details, 
        ip_address, 
        user_agent
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, action, timestamp
    `;

    try {
      const result = await db.query(query, [
        userId, 
        action, 
        JSON.stringify(details), 
        ipAddress, 
        userAgent
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('Error creating audit log:', error);
      throw error;
    }
  }

  /**
   * Search audit logs
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Object>} Search results with logs and metadata
   */
  static async search(searchParams = {}) {
    const { 
      userId, 
      action, 
      startDate, 
      endDate, 
      ipAddress,
      limit = 50, 
      offset = 0 
    } = searchParams;

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`user_id = $${paramIndex}`);
      values.push(userId);
      paramIndex++;
    }

    if (action) {
      conditions.push(`action = $${paramIndex}`);
      values.push(action);
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

    if (ipAddress) {
      conditions.push(`ip_address = $${paramIndex}`);
      values.push(ipAddress);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query to get logs
    const logsQuery = `
      SELECT 
        al.id, 
        al.user_id,
        u.username,
        al.action, 
        al.timestamp, 
        al.ip_address,
        al.details
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.timestamp DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // Query to get total count for pagination
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM audit_logs al
      ${whereClause}
    `;

    values.push(limit, offset);

    try {
      // Execute both queries
      const [logsResult, countResult] = await Promise.all([
        db.query(logsQuery, values),
        db.query(countQuery, values.slice(0, -2))
      ]);

      return {
        logs: logsResult.rows,
        total: parseInt(countResult.rows[0].total, 10),
        limit,
        offset
      };
    } catch (error) {
      console.error('Error searching audit logs:', error);
      throw error;
    }
  }

  /**
   * Get summary of audit log activities
   * @param {Object} summaryParams - Summary parameters
   * @returns {Promise<Object>} Activity summary
   */
  static async getSummary(summaryParams = {}) {
    const { 
      startDate, 
      endDate,
      interval = 'day' 
    } = summaryParams;

    // Validate interval
    const validIntervals = ['hour', 'day', 'week', 'month'];
    if (!validIntervals.includes(interval)) {
      throw new Error('Invalid interval. Must be one of: ' + validIntervals.join(', '));
    }

    const query = `
      SELECT 
        date_trunc($1, timestamp) AS period,
        COUNT(*) AS total_activities,
        COUNT(DISTINCT user_id) AS unique_users,
        COUNT(DISTINCT action) AS unique_actions,
        json_object_agg(action, COUNT(*)) AS action_breakdown
      FROM audit_logs
      WHERE 
        ($2::timestamp IS NULL OR timestamp >= $2)
        AND ($3::timestamp IS NULL OR timestamp <= $3)
      GROUP BY period
      ORDER BY period
    `;

    try {
      const result = await db.query(query, [
        interval, 
        startDate || null, 
        endDate || null
      ]);

      return {
        summary: result.rows,
        interval
      };
    } catch (error) {
      console.error('Error getting audit log summary:', error);
      throw error;
    }
  }

  /**
   * Export audit logs to a file
   * @param {Object} exportParams - Export parameters
   * @returns {Promise<string>} Path to exported file
   */
  static async export(exportParams = {}) {
    const { 
      userId, 
      action, 
      startDate, 
      endDate, 
      format = 'csv' 
    } = exportParams;

    // Validate export format
    const validFormats = ['csv', 'json'];
    if (!validFormats.includes(format)) {
      throw new Error('Invalid export format. Must be one of: ' + validFormats.join(', '));
    }

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`user_id = $${paramIndex}`);
      values.push(userId);
      paramIndex++;
    }

    if (action) {
      conditions.push(`action = $${paramIndex}`);
      values.push(action);
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        id, 
        user_id,
        action, 
        timestamp, 
        ip_address,
        details
      FROM audit_logs
      ${whereClause}
      ORDER BY timestamp DESC
    `;

    try {
      const result = await db.query(query, values);
      
      // Generate export file path
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const filename = `audit_log_export_${timestamp}.${format}`;
      const exportPath = `/exports/${filename}`;

      // Convert logs to desired format
      let exportContent;
      if (format === 'csv') {
        // Convert to CSV
        exportContent = this.convertToCsv(result.rows);
      } else {
        // JSON format
        exportContent = JSON.stringify(result.rows, null, 2);
      }

      // Write to file (this would typically use fs in a real implementation)
      await this.writeExportFile(exportPath, exportContent);

      return exportPath;
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      throw error;
    }
  }

  /**
   * Convert logs to CSV format
   * @param {Object[]} logs - Audit log entries
   * @returns {string} CSV content
   * @private
   */
  static convertToCsv(logs) {
    // CSV headers
    const headers = [
      'ID', 'User ID', 'Action', 'Timestamp', 
      'IP Address', 'Details'
    ];

    // Convert logs to CSV rows
    const csvRows = logs.map(log => [
      log.id,
      log.user_id,
      log.action,
      log.timestamp.toISOString(),
      log.ip_address,
      JSON.stringify(log.details).replace(/"/g, '""')
    ]);

    // Combine headers and rows
    return [
      headers.join(','),
      ...csvRows.map(row => row.map(val => `"${val}"`).join(','))
    ].join('\n');
  }

  /**
   * Write export file (mock implementation)
   * @param {string} path - File path
   * @param {string} content - File content
   * @private
   */
  static async writeExportFile(path, content) {
    // In a real implementation, this would use fs.writeFile
    console.log(`Exporting audit logs to ${path}`);
    // Simulate file writing
    return new Promise((resolve) => {
      // Simulated async file write
      setTimeout(() => resolve(true), 100);
    });
  }

  /**
   * Cleanup old audit logs
   * @param {number} retentionDays - Number of days to keep logs
   * @returns {Promise<number>} Number of logs deleted
   */
  static async cleanup(retentionDays = 90) {
    const query = `
      DELETE FROM audit_logs
      WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '${retentionDays} days'
      RETURNING id
    `;

    try {
      const result = await db.query(query);
      return result.rowCount;
    } catch (error) {
      console.error('Error cleaning up audit logs:', error);
      throw error;
    }
  }
}

module.exports = AuditModel;