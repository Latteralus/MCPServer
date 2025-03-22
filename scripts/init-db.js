const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

async function initializeDatabase() {
  const pool = new Pool({
    user: process.env.DB_USER || 'mcp_messenger_admin',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres', // Connect to default postgres database first
    password: process.env.DB_PASSWORD || 'admin123',
    port: process.env.DB_PORT || 5432
  });

  try {
    // Check if the database exists
    const dbName = process.env.DB_NAME || 'mcp_messenger_db';
    const dbCheckResult = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    // Create database if it doesn't exist
    if (dbCheckResult.rows.length === 0) {
      console.log(`Creating database: ${dbName}`);
      await pool.query(`CREATE DATABASE ${dbName}`);
    } else {
      console.log(`Database ${dbName} already exists`);
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
    console.log('Initializing database schema...');
    await appPool.query(schema);

    console.log('Database initialization complete');
    await appPool.end();
  } catch (error) {
    console.error('Error initializing database:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run database initialization
initializeDatabase();