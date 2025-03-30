const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('../config/logger'); // Import logger

// Load environment variables
dotenv.config();

// Check for required environment variables for the script
const requiredEnvVars = ['DB_USER', 'DB_HOST', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);


if (missingVars.length > 0) {
  logger.fatal(`ERROR: Missing required environment variables for DB initialization: ${missingVars.join(', ')}`);
  logger.error('Please ensure these are set in your .env file or environment.');
  process.exit(1); // Exit if required variables are missing
}
async function initializeDatabase() {
  // Use environment variables directly (already checked above)
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'postgres', // Connect to default postgres database first
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10) // Ensure port is an integer
  });

  const dbName = process.env.DB_NAME; // Use checked variable

  try {
    // Check if the database exists
    const dbCheckResult = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );
// Create database if it doesn't exist
if (dbCheckResult.rows.length === 0) {
  logger.info(`Creating database: ${dbName}`);
  await pool.query(`CREATE DATABASE ${dbName}`);
} else {
  logger.info(`Database ${dbName} already exists`);
}

    // Close initial connection
    await pool.end();

    // Connect to the specific database
    const appPool = new Pool({
      user: process.env.DB_USER || 'mcp_messenger_admin',
      host: process.env.DB_HOST || 'localhost',
      database: dbName,
      password: process.env.DB_PASSWORD || 'admin123',
      port: process.env.DB_PORT || 5432
    });

    // Read schema file
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    
        // Execute schema
        logger.info('Initializing database schema...');
        await appPool.query(schema);
    
    
    await appPool.end();
  } catch (error) {
    logger.error({ err: error }, 'Error initializing database');
    // Attempt to close the initial pool if it exists and the error occurred after its creation
    if (pool) await pool.end().catch(e => logger.error({ err: e }, 'Error closing initial pool during error handling'));
    process.exit(1);
}
} // Add missing closing brace for initializeDatabase function

// Run database initialization
initializeDatabase();