const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Database connection configuration
const pool = new Pool({
  user: process.env.DB_USER || 'mcp_messenger_admin',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'mcp_messenger_db',
  password: process.env.DB_PASSWORD || 'admin123',
  port: process.env.DB_PORT || 5432,
  max: process.env.DB_MAX_CONNECTIONS || 10,
  idleTimeoutMillis: process.env.DB_CONNECTION_TIMEOUT || 30000
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Successfully connected to PostgreSQL database');
    release();
  }
});

// Export the query method
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};