// config/database.js
// PostgreSQL database configuration and connection handling

const { Pool } = require('pg');
const logger = require('../config/logger'); // Import logger

// Load environment variables (Defaults should not be hardcoded here)
// The main application uses config.js which validates required env vars.
const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Set a reasonable connection timeout
  connectionTimeoutMillis: 5000,
  // Set a reasonable idle timeout
  idleTimeoutMillis: 30000,
  // Connection pool size
  max: 20
};

// Create connection pool
const pool = new Pool(dbConfig);

// Handle pool errors to prevent app crash
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
  // Don't crash the server on connection errors
});

/**
 * Query wrapper with error handling
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries for optimization
    if (duration > 100) {
      logger.warn({ duration, query: text, params }, `Slow query detected`);
    }
    
    return res;
  } catch (error) {
    logger.error({ err: error, query: text, params }, 'Database query error');
    // Add query details to error for better debugging
    error.query = text;
    error.params = params;
    throw error;
  }
}

/**
 * Test database connection
 * @returns {Promise<boolean>} Connection success
 */
async function testConnection() {
  try {
    const result = await query('SELECT NOW()');
    logger.info('Database connected successfully', { dbTime: result.rows[0] });
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Database connection test failed');
    return false;
  }
}

// Perform initial connection test
testConnection()
  .then(success => {
    if (!success) {
      logger.warn('Initial database connection test failed - check configuration');
    }
  })
  .catch(err => {
    logger.error({ err }, 'Error during initial database connection test');
  });

// Export pool and query helper
module.exports = {
  pool,
  query,
  testConnection
};