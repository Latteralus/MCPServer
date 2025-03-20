const rateLimit = require('express-rate-limit');
const AuditModel = require('../../models/auditModel');

/**
 * Convert IP to binary representation
 * @param {string} ip - IP address
 * @returns {string} Binary representation of IP
 */
function ipToBinary(ip) {
  return ip.split('.').map(octet => 
    parseInt(octet, 10).toString(2).padStart(8, '0')
  ).join('');
}

/**
 * Check if an IP is in a given subnet
 * @param {string} ip - IP address to check
 * @param {string} subnet - Subnet in CIDR notation
 * @returns {boolean} Whether IP is in subnet
 */
function isInSubnet(ip, subnet) {
  const subnetParts = subnet.split('/');
  
  if (subnetParts.length !== 2) return false;

  const [subnetIp, mask] = subnetParts;
  
  // Convert IP and subnet to binary
  const ipBinary = ipToBinary(ip);
  const subnetBinary = ipToBinary(subnetIp);

  // Compare first 'mask' bits
  return ipBinary.slice(0, parseInt(mask)) === subnetBinary.slice(0, parseInt(mask));
}

/**
 * Create a rate limiter with configurable options
 * @param {Object} options - Rate limiting configuration
 * @returns {Function} Rate limiting middleware
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // Limit each IP to 100 requests per windowMs
    message = 'Too many requests, please try again later',
    standardHeaders = true, // Return rate limit info in RateLimit-* headers
    legacyHeaders = false, // Disable the X-RateLimit-* headers
  } = options;

  const limiter = rateLimit({
    windowMs,
    max,
    message,
    standardHeaders,
    legacyHeaders,
    
    // Custom handler for rate limit exceeded
    handler: async (req, res, next, options) => {
      // Log rate limit violation
      await AuditModel.log({
        action: 'rate_limit_exceeded',
        details: {
          ipAddress: req.ip,
          path: req.path,
          method: req.method
        }
      });

      // Send rate limit response
      res.status(429).json({
        error: options.message,
        retryAfter: Math.ceil(options.windowMs / 1000 / 60) // minutes
      });
    },

    // Optional: Skip rate limiting for trusted IPs (local network)
    skip: (req) => {
      // Allow unlimited requests from localhost or internal network
      const trustedIPs = [
        '127.0.0.1', 
        '::1',  // IPv6 localhost
        '192.168.0.0/16',  // Local network range
        '10.0.0.0/8'       // Another local network range
      ];

      return trustedIPs.some(ip => isInSubnet(req.ip, ip));
    }
  });

  return limiter;
}

// Create default rate limiter
const defaultRateLimiter = createRateLimiter();

module.exports = {
  createRateLimiter,
  defaultRateLimiter
};