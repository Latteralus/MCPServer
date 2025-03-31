const db = require('../config/database');
const config = require('../config');
const os = require('os'); // Added for hostname
const logger = require('../config/logger'); // Import logger
const crypto = require('crypto'); // Added for hashing

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
    // Define critical events that should never be batched
    const criticalEvents = [
      'authentication_failure',
      'authorization_failure',
      'phi_access',
      'password_change_error',
      'password_reset_error',
      'security_setting_change',
      'user_deleted',
      'channel_deleted'
      // Add other critical events as needed
    ];
    const isCritical = criticalEvents.includes(logData.action);

    // If batching is enabled BUT the event is critical, log immediately
    if (this.batchingEnabled && !isCritical) {
      this.batchBuffer.push(logData);
      // Ensure batch timer is running if batching is enabled
      if (!this.batchTimer) {
        this.startBatching();
      }
      return Promise.resolve({ batched: true });
    }

    // Log immediately (either batching disabled or event is critical)
    return this.writeLogImmediately(logData);
  }

  /**
   * Writes a single log entry immediately to the database.
   * Includes enhanced details.
   * @param {Object} logData - Audit log entry data
   * @returns {Promise<Object>} Created audit log entry
   * @private
   */
  static async writeLogImmediately(logData) {
    const {
      userId = null,
      action,
      details = {},
      ipAddress = null,
      userAgent = null
    } = logData;

    try {
      // 1. Get the hash of the most recent log entry
      const lastLogResult = await db.query(
        'SELECT current_log_hash FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT 1'
      );
      const previousLogHash = lastLogResult.rows[0]?.current_log_hash || null;

      // Enhance details with system context
      const enhancedDetails = {
        ...details,
        hostname: os.hostname(),
        processId: process.pid,
      };
      const detailsString = JSON.stringify(enhancedDetails);

      // 2. Calculate the hash for the new entry
      const currentLogHash = this.calculateLogHash(
        userId, action, detailsString, ipAddress, userAgent, previousLogHash
      );

      // 3. Insert the new log entry with both hashes
      const query = `
        INSERT INTO audit_logs (
          user_id,
          action,
          details,
          ip_address,
          user_agent,
          previous_log_hash,
          current_log_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, user_id, action, timestamp, current_log_hash
      `;

      const result = await db.query(query, [
        userId,
        action,
        detailsString,
        ipAddress,
        userAgent,
        previousLogHash,
        currentLogHash
      ]);
      return result.rows[0];
    } catch (error) {
      logger.error({ err: error, logData }, 'Error creating tamper-evident audit log immediately');
      throw error;
    }
  }

  /**
   * Calculates the SHA-256 hash for a log entry.
   * @param {string|null} userId
   * @param {string} action
   * @param {string} detailsString - JSON stringified details
   * @param {string|null} ipAddress
   * @param {string|null} userAgent
   * @param {string|null} previousLogHash
   * @returns {string} SHA-256 hash
   * @private
   */
  static calculateLogHash(userId, action, detailsString, ipAddress, userAgent, previousLogHash) {
    const hashInput = [
      userId || 'null',
      action,
      detailsString,
      ipAddress || 'null',
      userAgent || 'null',
      previousLogHash || 'null' // Include previous hash in the current hash calculation
    ].join('|'); // Use a delimiter

    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Log an audit action using the provided transaction client.
   * @param {Object} client - Database client from a transaction.
   * @param {Object} logData - Audit log entry data.
   * @returns {Promise<Object>} The created audit log entry.
   */
  static async logWithClient(client, logData) {
    // NOTE: Tamper-evidence hashing is now implemented for transactional logs.
    const {
      userId = null,
      action,
      details = {},
      ipAddress = null,
      userAgent = null
    } = logData;

    // Enhance details with system context
    const enhancedDetails = {
      ...details,
      hostname: os.hostname(),
      processId: process.pid,
    };
    const detailsString = JSON.stringify(enhancedDetails);

    try {
      // 1. Get the hash of the most recent log entry using the transaction client
      // Note: This fetches the globally latest hash, assuming transactions are short-lived.
      // For strict transaction-local chaining, a different approach might be needed.
      const lastLogResult = await client.query(
        'SELECT current_log_hash FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT 1'
      );
      const previousLogHash = lastLogResult.rows[0]?.current_log_hash || null;

      // 2. Calculate the hash for the new entry
      const currentLogHash = this.calculateLogHash(
        userId, action, detailsString, ipAddress, userAgent, previousLogHash
      );

      // 3. Insert the new log entry with both hashes using the transaction client
      const query = `
        INSERT INTO audit_logs (
          user_id,
          action,
          details,
          ip_address,
          user_agent,
          previous_log_hash,
          current_log_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, user_id, action, timestamp, current_log_hash
      `;

      const result = await client.query(query, [
        userId,
        action,
        detailsString,
        ipAddress,
        userAgent,
        previousLogHash,
        currentLogHash
      ]);
      return result.rows[0];
    } catch (error) {
      // Log error but don't throw within transaction context? Or let caller handle?
      // For now, logging and re-throwing.
      logger.error({ err: error, logData }, 'Error creating tamper-evident audit log within transaction');
      throw error;
    }
  }

  // --- Batching Logic --- (Adjusted comment)
  static async flushBatch() {
    if (this.batchBuffer.length === 0) return;
    const entries = this.batchBuffer;
    this.batchBuffer = []; // Clear the buffer

    // NOTE: Tamper-evidence hashing is NOT implemented for batched logs
    // due to complexity in calculating sequential hashes during bulk insert.
    const values = [];
    const rows = [];
    let paramIndex = 1;
    for (const entry of entries) {
      const { userId = null, action, details = {}, ipAddress = null, userAgent = null } = entry;
      // Enhance details with system context for each entry
      const enhancedDetails = {
        ...details,
        hostname: os.hostname(),
        processId: process.pid,
      };
      rows.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
      values.push(userId, action, JSON.stringify(enhancedDetails), ipAddress, userAgent);
    }

    const query = `
      INSERT INTO audit_logs (
        user_id,
        action,
        details,
        ip_address,
        user_agent
        -- previous_log_hash and current_log_hash are omitted here
      ) VALUES ${rows.join(', ')}
      RETURNING id, user_id, action, timestamp
    `;

    try {
      await db.query(query, values);
      logger.info(`Flushed ${entries.length} audit logs.`);
    } catch (error) {
      logger.error({ err: error, batchSize: entries.length }, 'Error flushing audit log batch');
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
      logger.error({ err: error, searchParams }, 'Error searching audit logs');
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
      logger.error({ err: error, summaryParams }, 'Error getting audit log summary');
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
      logger.error({ err: error, exportParams }, 'Error exporting audit logs');
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
    logger.info({ exportPath: path }, `Exporting audit logs`); // Placeholder function
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 100); // Simulating file write
    });
  }
}

module.exports = AuditModel;
