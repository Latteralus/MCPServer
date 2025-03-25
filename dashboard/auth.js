// server/dashboard/auth.js - Authentication for admin dashboard
const crypto = require('crypto');
const { getConfig, verifyPassword } = require('./config');
const { logAction } = require('./audit');

// Active admin sessions
const activeSessions = new Map();
// Failed login attempts tracking
const failedAttempts = new Map();

/**
 * Create a new admin session
 * @param {string} username - Admin username
 * @param {string} ip - IP address of client
 * @returns {string} Session ID
 */
function createSession(username, ip) {
  // Generate a secure random session ID
  const sessionId = crypto.randomBytes(32).toString('hex');
  
  // Get session duration from config
  const sessionDuration = getConfig('auth.sessionDuration', 60 * 60 * 1000);
  
  // Create session object
  const session = {
    username,
    ip,
    created: Date.now(),
    expires: Date.now() + sessionDuration,
    lastActivity: Date.now()
  };
  
  // Store in active sessions
  activeSessions.set(sessionId, session);
  
  // Log session creation
  logAction(username, 'login', { ip });
  
  return sessionId;
}

/**
 * Validate an admin session
 * @param {string} sessionId - Session ID
 * @param {string} ip - IP address of client
 * @returns {object|null} Session data or null if invalid
 */
function validateSession(sessionId, ip) {
  if (!sessionId) return null;
  
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  
  // Check if session has expired
  if (session.expires < Date.now()) {
    activeSessions.delete(sessionId);
    return null;
  }
  
  // Get session idle timeout from config
  const idleTimeout = getConfig('security.sessionIdleTimeout', 30 * 60 * 1000);
  
  // Check if session has been idle for too long
  if (Date.now() - session.lastActivity > idleTimeout) {
    activeSessions.delete(sessionId);
    logAction(session.username, 'session_timeout', { sessionId });
    return null;
  }
  
  // Optional IP validation (if same IP enforcement is enabled)
  const enforceIpMatch = getConfig('security.enforceIpMatch', false);
  if (enforceIpMatch && session.ip !== ip) {
    activeSessions.delete(sessionId);
    logAction(session.username, 'session_ip_mismatch', { sessionId, expectedIp: session.ip, actualIp: ip });
    return null;
  }
  
  // Update last activity time
  session.lastActivity = Date.now();
  activeSessions.set(sessionId, session);
  
  return session;
}

/**
 * End an admin session (logout)
 * @param {string} sessionId - Session ID to end
 * @returns {boolean} Success status
 */
function endSession(sessionId) {
  const session = activeSessions.get(sessionId);
  
  if (session) {
    // Log the logout action
    logAction(session.username, 'logout', { sessionId });
    
    // Remove the session
    activeSessions.delete(sessionId);
    return true;
  }
  
  return false;
}

/**
 * Authenticate admin credentials
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string} ip - IP address of client
 * @returns {string|null} Session ID if successful, null if failed
 */
function authenticate(username, password, ip) {
  // Check if account is locked
  if (isAccountLocked(ip)) {
    logAction('system', 'login_blocked', { username, ip, reason: 'account_locked' });
    return null;
  }
  
  // Get credentials from config
  const configUsername = getConfig('auth.username');
  const configPasswordHash = getConfig('auth.passwordHash');
  
  // Validate credentials
  if (username === configUsername && verifyPassword(password, configPasswordHash)) {
    // Reset failed attempts for this IP
    resetFailedAttempts(ip);
    
    // Create and return new session
    return createSession(username, ip);
  }
  
  // Credentials are invalid, record failed attempt
  recordFailedAttempt(ip);
  logAction('system', 'login_failed', { username, ip });
  
  return null;
}

/**
 * Record a failed login attempt
 * @param {string} ip - IP address of client
 */
function recordFailedAttempt(ip) {
  const attempts = failedAttempts.get(ip) || 0;
  failedAttempts.set(ip, attempts + 1);
}

/**
 * Reset failed login attempts
 * @param {string} ip - IP address of client
 */
function resetFailedAttempts(ip) {
  failedAttempts.delete(ip);
}

/**
 * Check if account is locked due to too many failed attempts
 * @param {string} ip - IP address of client
 * @returns {boolean} Whether account is locked
 */
function isAccountLocked(ip) {
  const attempts = failedAttempts.get(ip) || 0;
  const maxAttempts = getConfig('auth.maxFailedAttempts', 5);
  
  return attempts >= maxAttempts;
}

/**
 * Get session by username
 * @param {string} username - Username to find
 * @returns {object|null} Session if found, null otherwise
 */
function getSessionByUsername(username) {
  for (const [id, session] of activeSessions.entries()) {
    if (session.username === username) {
      return { id, ...session };
    }
  }
  
  return null;
}

/**
 * Get all active sessions
 * @returns {object[]} Array of session objects with IDs
 */
function getAllSessions() {
  const sessions = [];
  
  for (const [id, session] of activeSessions.entries()) {
    sessions.push({
      id,
      username: session.username,
      ip: session.ip,
      created: session.created,
      expires: session.expires,
      lastActivity: session.lastActivity
    });
  }
  
  return sessions;
}

/**
 * Clean up expired and idle sessions
 * @returns {number} Number of sessions cleaned up
 */
function cleanupSessions() {
  const now = Date.now();
  const idleTimeout = getConfig('security.sessionIdleTimeout', 30 * 60 * 1000);
  
  let cleanedCount = 0;
  
  for (const [id, session] of activeSessions.entries()) {
    // Check if session has expired
    if (session.expires < now) {
      activeSessions.delete(id);
      cleanedCount++;
      continue;
    }
    
    // Check if session has been idle for too long
    if (now - session.lastActivity > idleTimeout) {
      activeSessions.delete(id);
      logAction(session.username, 'session_timeout_cleanup', { sessionId: id });
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    logAction('system', 'session_cleanup', { 
      cleanedCount, 
      remainingCount: activeSessions.size 
    });
  }
  
  return cleanedCount;
}

/**
 * Clean up expired failed login attempts
 */
function cleanupFailedAttempts() {
  const lockDuration = getConfig('auth.lockDuration', 30 * 60 * 1000); // Default 30 minutes
  const now = Date.now();
  const lockCreationTimes = new Map();
  
  // Clean up lock records older than lockDuration
  for (const [ip, _] of failedAttempts.entries()) {
    const lockTime = lockCreationTimes.get(ip) || 0;
    if (now - lockTime > lockDuration) {
      failedAttempts.delete(ip);
      lockCreationTimes.delete(ip);
    }
  }
}

// Run session cleanup periodically
const CLEANUP_INTERVAL = 15 * 60 * 1000; // Every 15 minutes
setInterval(() => {
  const cleanedSessions = cleanupSessions();
  cleanupFailedAttempts();
  
  // Log stats about current memory usage
  if (cleanedSessions > 0) {
    const memoryUsage = process.memoryUsage();
    logAction('system', 'memory_stats', {
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
      activeSessions: activeSessions.size,
      failedAttemptRecords: failedAttempts.size
    });
  }
}, CLEANUP_INTERVAL);

// Export authentication functions
module.exports = {
  createSession,
  validateSession,
  endSession,
  authenticate,
  getSessionByUsername,
  getAllSessions,
  isAccountLocked,
  resetFailedAttempts,
  cleanupSessions // Export for testing or manual cleanup
};