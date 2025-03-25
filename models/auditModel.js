const db = require('../config/database');
const config = require('../config');

class AuditModel {
  // Enable batching if the config flag is set
  static batchingEnabled = config.auditBatching === true;
  static batchBuffer = [];
  static batchIntervalMs = config.auditBatchInterval || 5000; // Default to 5 seconds
  static batchTimer = null;

  /**
   * Log an action for audit purposes.
   * If batching is enabled, the log entry is added to the buffer.
   * Otherwise, it is written immediately.
   * @param {Object} logData - Audit log entry data
   * @returns {Promise<Object>} Created audit log entry or a batched flag
   */
  static async log(logData) {
    if (this.batchingEnabled) {
      this.batchBuffer.push(logData);
      return Promise.resolve({ batched: true });
    }

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
   * Log an audit action using the provided transaction client.
   * @param {Object} client - Database client from a transaction.
   * @param {Object} logData - Audit log entry data.
   * @returns {Promise<Object>} The created audit log entry.
   */
  static async logWithClient(client, logData) {
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
    const result = await client.query(query, [
      userId,
      action,
      JSON.stringify(details),
      ipAddress,
      userAgent
    ]);
    return result.rows[0];
  }

  // The following methods remain unchanged
  static async flushBatch() {
    if (this.batchBuffer.length === 0) return;
    const entries = this.batchBuffer;
    this.batchBuffer = []; // Clear the buffer

    const values = [];
    const rows = [];
    let paramIndex = 1;
    for (const entry of entries) {
      const { userId = null, action, details = {}, ipAddress = null, userAgent = null } = entry;
      rows.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
      values.push(userId, action, JSON.stringify(details), ipAddress, userAgent);
    }

    const query = `
      INSERT INTO audit_logs (
        user_id, 
        action, 
        details, 
        ip_address, 
        user_agent
      ) VALUES ${rows.join(', ')}
      RETURNING id, user_id, action, timestamp
    `;

    try {
      await db.query(query, values);
      console.log(`Flushed ${entries.length} audit logs.`);
    } catch (error) {
      console.error('Error flushing audit log batch:', error);
    }
  }

  static startBatching() {
    if (this.batchingEnabled && !this.batchTimer) {
      this.batchTimer = setInterval(() => {
        this.flushBatch();
      }, this.batchIntervalMs);
    }
  }

  static async stopBatching() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    await this.flushBatch();
  }

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

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM audit_logs al
      ${whereClause}
    `;

    values.push(limit, offset);

    try {
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

  static async getSummary(summaryParams = {}) {
    const { 
      startDate, 
      endDate,
      interval = 'day' 
    } = summaryParams;

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

  static async export(exportParams = {}) {
    const { 
      userId, 
      action, 
      startDate, 
      endDate, 
      format = 'csv' 
    } = exportParams;

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
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const filename = `audit_log_export_${timestamp}.${format}`;
      const exportPath = `/exports/${filename}`;
      let exportContent;
      if (format === 'csv') {
        exportContent = this.convertToCsv(result.rows);
      } else {
        exportContent = JSON.stringify(result.rows, null, 2);
      }
      await this.writeExportFile(exportPath, exportContent);
      return exportPath;
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      throw error;
    }
  }

  static convertToCsv(logs) {
    const headers = [
      'ID', 'User ID', 'Action', 'Timestamp', 
      'IP Address', 'Details'
    ];

    const csvRows = logs.map(log => [
      log.id,
      log.user_id,
      log.action,
      log.timestamp.toISOString(),
      log.ip_address,
      JSON.stringify(log.details).replace(/"/g, '""')
    ]);

    return [
      headers.join(','),
      ...csvRows.map(row => row.map(val => `"${val}"`).join(','))
    ].join('\n');
  }

  static async writeExportFile(path, content) {
    console.log(`Exporting audit logs to ${path}`);
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 100);
    });
  }
}

module.exports = AuditModel;
