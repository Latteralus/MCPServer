const { Pool } = require('pg');
const config = require('../config');
const logger = require('../config/logger'); // Import logger

// Extract database configuration from the validated config object
const dbConfig = config.database;

// Initialize the connection pool with enhanced configuration
const pool = new Pool({
  user: dbConfig.user,
  host: dbConfig.host,
  database: dbConfig.name,
  password: dbConfig.password,
  port: dbConfig.port,
  min: dbConfig.minConnections,
  max: dbConfig.maxConnections,
  acquireTimeoutMillis: dbConfig.acquireTimeoutMillis,
  createTimeoutMillis: dbConfig.createTimeoutMillis,
  idleTimeoutMillis: dbConfig.idleTimeoutMillis,
  reapIntervalMillis: dbConfig.reapIntervalMillis,
  createRetryIntervalMillis: dbConfig.createRetryIntervalMillis,
  statement_timeout: dbConfig.statement_timeout
});

// Pool event handling for better monitoring and error management
pool.on('error', (err, client) => {
  logger.error({ err, clientInfo: client?.processID }, 'Unexpected database pool error');
  // Insert alerting/monitoring logic as needed
});

pool.on('connect', (client) => {
  logger.debug({ clientPID: client?.processID }, 'New client connected to the database pool');
  // Set the statement timeout at the client level for additional safety
  client.query(`SET statement_timeout = ${dbConfig.statement_timeout}`)
  .catch(err => logger.error({ err, clientPID: client?.processID }, 'Error setting statement timeout for new client'));
});

// Monitor connection pool status if enabled
let poolMonitorInterval = null;
if (process.env.ENABLE_POOL_MONITORING === 'true') {
  poolMonitorInterval = setInterval(() => {
    const poolStatus = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
      timestamp: new Date().toISOString()
    };
    
    logger.info('Database pool status:', poolStatus);
    
    // Alert if too many clients are waiting
    if (poolStatus.waitingCount > 5) {
      logger.warn({ poolStatus }, 'Connection pool under pressure - high waiting count');
    }
  }, parseInt(process.env.POOL_MONITOR_INTERVAL || '60000'));
}

// Test database connection with retry logic for transient startup issues
const testConnection = async (retries = 3, delay = 2000) => {
  let attempts = 0;
  while (attempts < retries) {
    try {
      const client = await pool.connect();
      logger.info('Successfully connected to PostgreSQL database');
      client.release();
      return true;
    } catch (err) {
      attempts++;
      logger.error({ err, attempt: attempts, totalRetries: retries }, `Error connecting to the database`);
      if (attempts >= retries) {
        logger.error('Maximum connection retry attempts reached');
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Execute an initial connection test
testConnection()
  .catch(err => {
    logger.fatal({ err }, 'Fatal database connection error during startup');
    process.exit(1);
  });

// Graceful shutdown function to properly close the connection pool
const closePool = async () => {
  if (poolMonitorInterval) {
    clearInterval(poolMonitorInterval);
  }
  
  logger.info('Closing database connection pool...');
  try {
    await pool.end();
    logger.info('Database connection pool closed successfully');
  } catch (err) {
    logger.error({ err }, 'Error closing database connection pool');
  }
};

// Setup graceful shutdown on termination signals
process.on('SIGTERM', closePool);
process.on('SIGINT', closePool);

// Enhanced query method with retry logic for transient errors
const query = async (text, params, retries = 2) => {
  let attempts = 0;
  const transientErrors = ['57P01', '40001', '40P01']; // connection_failure, serialization_failure, deadlock_detected
  
  while (attempts <= retries) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      attempts++;
      if (transientErrors.includes(err.code) && attempts <= retries) {
        logger.warn({ err, attempt: attempts, totalRetries: retries, query: text }, `Transient database error (${err.code}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 100 * attempts));
        continue;
      }
      throw err;
    }
  }
};

module.exports = {
  query,
  pool,
  closePool,
  getPoolStatus: () => ({
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  })
};
