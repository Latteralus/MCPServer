const { Pool } = require('pg');
const config = require('./config');

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
  console.error('Unexpected database pool error:', err);
  // Insert alerting/monitoring logic as needed
});

pool.on('connect', (client) => {
  console.log('New client connected to the database pool');
  // Set the statement timeout at the client level for additional safety
  client.query('SET statement_timeout TO $1', [dbConfig.statement_timeout])
    .catch(err => console.error('Error setting statement timeout:', err));
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
    
    console.log('Pool status:', poolStatus);
    
    // Alert if too many clients are waiting
    if (poolStatus.waitingCount > 5) {
      console.warn('Connection pool under pressure - waiting clients:', poolStatus.waitingCount);
    }
  }, parseInt(process.env.POOL_MONITOR_INTERVAL || '60000'));
}

// Test database connection with retry logic for transient startup issues
const testConnection = async (retries = 3, delay = 2000) => {
  let attempts = 0;
  while (attempts < retries) {
    try {
      const client = await pool.connect();
      console.log('Successfully connected to PostgreSQL database');
      client.release();
      return true;
    } catch (err) {
      attempts++;
      console.error(`Error connecting to the database (attempt ${attempts}/${retries}):`, err);
      if (attempts >= retries) {
        console.error('Maximum connection retry attempts reached');
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Execute an initial connection test
testConnection()
  .catch(err => {
    console.error('Fatal database connection error:', err);
    process.exit(1);
  });

// Graceful shutdown function to properly close the connection pool
const closePool = async () => {
  if (poolMonitorInterval) {
    clearInterval(poolMonitorInterval);
  }
  
  console.log('Closing database connection pool');
  try {
    await pool.end();
    console.log('Database connection pool closed successfully');
  } catch (err) {
    console.error('Error closing database connection pool:', err);
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
        console.warn(`Transient database error (${err.code}), retrying (${attempts}/${retries})...`);
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
