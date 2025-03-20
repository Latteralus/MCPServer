const AuthService = require('../../services/authService');
const PermissionService = require('../../services/permissionService');
const AuditModel = require('../../models/auditModel');

/**
 * Authentication middleware for API routes
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Next middleware function
 */
async function authMiddleware(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Authentication token required' 
      });
    }

    // Extract token (assuming Bearer token)
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        error: 'Invalid token format' 
      });
    }

    // Validate token
    const user = await AuthService.validateSessionToken(token);

    if (!user) {
      // Log unauthorized access attempt
      await AuditModel.log({
        action: 'unauthorized_api_access',
        details: { 
          ipAddress: req.ip,
          path: req.path 
        }
      });

      return res.status(401).json({ 
        error: 'Invalid or expired authentication token' 
      });
    }

    // Attach user to request for further use
    req.user = user;

    // Optional: Check route-specific permissions
    if (req.requiredPermission) {
      const hasPermission = await PermissionService.hasPermission(
        user.id, 
        req.requiredPermission
      );

      if (!hasPermission) {
        // Log permission denied attempt
        await AuditModel.log({
          userId: user.id,
          action: 'permission_denied',
          details: { 
            requiredPermission: req.requiredPermission,
            path: req.path 
          }
        });

        return res.status(403).json({ 
          error: 'Insufficient permissions' 
        });
      }
    }

    // Continue to next middleware
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);

    // Log unexpected authentication error
    await AuditModel.log({
      action: 'auth_middleware_error',
      details: { 
        error: error.message,
        path: req.path 
      }
    });

    res.status(500).json({ 
      error: 'Internal authentication error' 
    });
  }
}

module.exports = authMiddleware;