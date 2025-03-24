// config/database.js
// PostgreSQL database configuration and connection handling

const { Pool } = require('pg');

// Load environment variables or use defaults
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'hipaa_chat',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
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
  console.error('Unexpected database pool error:', err);
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
      console.warn(`Slow query (${duration}ms): ${text}`);
    }
    
    return res;
  } catch (error) {
    console.error('Database query error:', error);
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
    console.log('Database connected successfully', result.rows[0]);
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// Perform initial connection test
testConnection()
  .then(success => {
    if (!success) {
      console.warn('Initial database connection test failed - check configuration');
    }
  })
  .catch(err => {
    console.error('Error during initial database connection test:', err);
  });

// Export pool and query helper
module.exports = {
  pool,
  query,
  testConnection
};