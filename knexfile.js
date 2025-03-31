// knexfile.js
require('dotenv').config(); // Load .env variables

module.exports = {
  development: {
    client: 'pg', // Specify the database client
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'admin123',
      database: process.env.DB_NAME || 'mcp_chat_db',
    },
    migrations: {
      directory: './database/migrations', // Directory for migration files
    },
    seeds: {
      directory: './database/seeds', // Point back to the conventional seeds directory
    },
  },

  // Add other environments like production if needed
  // production: {
  //   client: 'pg',
  //   connection: {
  //     host: process.env.PROD_DB_HOST,
  //     port: process.env.PROD_DB_PORT,
  //     user: process.env.PROD_DB_USER,
  //     password: process.env.PROD_DB_PASSWORD,
  //     database: process.env.PROD_DB_NAME,
  //   },
  //   migrations: {
  //     directory: './database/migrations',
  //   },
  //   seeds: {
  //     directory: './database/seeds',
  //   },
  // },
};