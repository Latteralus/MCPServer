// server/dashboard/metrics.js - Metrics collection for admin dashboard
const os = require('os');

// Store metrics history
const metricsHistory = {
  connections: [],
  messages: [],
  memory: [],
  cpu: []
};

// Maximum history length (100 data points)
const MAX_HISTORY_LENGTH = 100;

// Message counts
let messageCounts = {
  total: 0,
  today: 0,
  lastReset: new Date()
};

// Client connection statistics
let connectionStats = {
  totalConnections: 0,
  disconnections: 0,
  peakConcurrent: 0,
  avgDuration: 0,
  totalDuration: 0,
  connectionCount: 0
};

// System resource usage 
let systemResources = {};

/**
 * Start metrics collection
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 * @returns {object} Metrics API
 */
function startMetricsCollection(wss, clients) {
  // Collect metrics immediately
  collectMetrics(wss, clients);
  
  // Set up interval for metrics collection
  const metricsInterval = setInterval(() => {
    collectMetrics(wss, clients);
  }, 10000); // Every 10 seconds
  
  // Reset daily counters at midnight
  setupDailyReset();
  
  // Return API for interacting with metrics
  return {
    getMetrics: () => getMetrics(wss, clients),
    shutdown: () => clearInterval(metricsInterval),
    recordMessage: recordMessage,
    recordConnection: recordConnection,
    recordDisconnection: recordDisconnection,
    resetCounters: resetCounters
  };
}

/**
 * Collect metrics data
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 */
function collectMetrics(wss, clients) {
  const timestamp = new Date().toISOString();
  
  // Collect connection count
  const connectionCount = wss ? wss.clients.size : 0;
  metricsHistory.connections.push({
    timestamp,
    count: connectionCount
  });
  
  // Update peak concurrent users if needed
  if (connectionCount > connectionStats.peakConcurrent) {
    connectionStats.peakConcurrent = connectionCount;
  }
  
  // Collect memory usage
  const memoryUsage = process.memoryUsage();
  metricsHistory.memory.push({
    timestamp,
    heap: memoryUsage.heapUsed,
    rss: memoryUsage.rss,
    external: memoryUsage.external,
    total: memoryUsage.heapTotal
  });
  
  // Collect CPU usage
  const cpuUsage = os.loadavg();
  metricsHistory.cpu.push({
    timestamp,
    load1: cpuUsage[0],
    load5: cpuUsage[1],
    load15: cpuUsage[2]
  });
  
  // Collect message rate (messages in the last interval)
  const messageRate = messageCounts.today - (metricsHistory.messages.length > 0 ? 
    metricsHistory.messages[metricsHistory.messages.length - 1].total : 0);
  
  metricsHistory.messages.push({
    timestamp,
    rate: messageRate,
    total: messageCounts.today
  });
  
  // Update system resource information
  updateSystemResources();
  
  // Limit history length by removing oldest entries when exceeding max length
  if (metricsHistory.connections.length > MAX_HISTORY_LENGTH) {
    metricsHistory.connections.shift();
  }
  
  if (metricsHistory.messages.length > MAX_HISTORY_LENGTH) {
    metricsHistory.messages.shift();
  }
  
  if (metricsHistory.memory.length > MAX_HISTORY_LENGTH) {
    metricsHistory.memory.shift();
  }
  
  if (metricsHistory.cpu.length > MAX_HISTORY_LENGTH) {
    metricsHistory.cpu.shift();
  }
}

/**
 * Get current metrics
 * @param {object} wss - WebSocket server instance
 * @param {Map} clients - Client map
 * @returns {object} Current metrics
 */
function getMetrics(wss, clients) {
  const activeConnections = wss ? wss.clients.size : 0;
  
  return {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeConnections,
    messageCounts: {
      total: messageCounts.total,
      today: messageCounts.today
    },
    connectionStats: {
      total: connectionStats.totalConnections,
      disconnections: connectionStats.disconnections,
      peak: connectionStats.peakConcurrent,
      averageDuration: connectionStats.avgDuration
    },
    memoryUsage: process.memoryUsage(),
    system: systemResources,
    history: {
      connections: metricsHistory.connections,
      messages: metricsHistory.messages,
      memory: metricsHistory.memory,
      cpu: metricsHistory.cpu
    }
  };
}

/**
 * Record a message being sent
 */
function recordMessage() {
  messageCounts.total++;
  messageCounts.today++;
}

/**
 * Record a new connection
 * @param {Date} timestamp - When the connection occurred
 */
function recordConnection(timestamp = new Date()) {
  connectionStats.totalConnections++;
  connectionStats.connectionCount++;
}

/**
 * Record a disconnection
 * @param {Date} connectTime - When the connection was established
 * @param {Date} disconnectTime - When the disconnection occurred
 */
function recordDisconnection(connectTime, disconnectTime = new Date()) {
  connectionStats.disconnections++;
  connectionStats.connectionCount--;
  
  // Calculate connection duration in seconds
  const duration = (disconnectTime - connectTime) / 1000;
  
  // Update average duration
  const totalDuration = connectionStats.totalDuration + duration;
  const count = connectionStats.totalConnections - connectionStats.connectionCount;
  
  connectionStats.totalDuration = totalDuration;
  connectionStats.avgDuration = count > 0 ? totalDuration / count : 0;
}

/**
 * Update system resource information
 */
function updateSystemResources() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  
  systemResources = {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    memory: {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem,
      percentUsed: ((totalMem - freeMem) / totalMem * 100).toFixed(2)
    },
    hostname: os.hostname(),
    loadAvg: os.loadavg()
  };
}

/**
 * Set up daily counter reset
 */
function setupDailyReset() {
  // Calculate time until midnight
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  
  const timeUntilMidnight = midnight - now;
  
  // Set timeout to reset counters at midnight
  setTimeout(() => {
    resetCounters();
    
    // Set up the next day's reset
    setupDailyReset();
  }, timeUntilMidnight);
}

/**
 * Reset daily counters
 */
function resetCounters() {
  messageCounts.today = 0;
  messageCounts.lastReset = new Date();
}

// Export metrics functions
module.exports = {
  startMetricsCollection,
  getMetrics,
  recordMessage,
  recordConnection,
  recordDisconnection
};