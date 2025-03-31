// MCPServer/api/routes/roleRoutes.js
const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController'); // To be created
const { validationMiddleware, ValidationRules } = require('../middleware/validation');
const PermissionService = require('../../services/permissionService'); // For permission checks
const AuditModel = require('../../models/auditModel'); // For logging

// Middleware to check for admin permissions for role management
const checkAdminPermission = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const hasPermission = await PermissionService.validatePermissions(userId, ['admin.roles']); // Example permission
    if (!hasPermission) {
      await AuditModel.log({
        userId,
        action: 'unauthorized_role_access',
        details: { endpoint: req.originalUrl, ipAddress: req.ip }
      });
      return res.status(403).json({ error: 'Insufficient permissions for role management' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Apply admin check middleware to all role routes
router.use(checkAdminPermission);

/**
 * @route   GET /api/roles
 * @desc    Get all roles
 * @access  Admin Protected
 */
router.get('/', roleController.getAllRoles);

/**
 * @route   POST /api/roles
 * @desc    Create a new role
 * @access  Admin Protected
 */
router.post('/', ValidationRules.createRole, validationMiddleware, roleController.createRole); // Add validation rules later

/**
 * @route   GET /api/roles/:id
 * @desc    Get a specific role by ID
 * @access  Admin Protected
 */
router.get('/:id', roleController.getRoleById); // Add validation later if needed

/**
 * @route   PUT /api/roles/:id
 * @desc    Update an existing role
 * @access  Admin Protected
 */
router.put('/:id', ValidationRules.createRole, validationMiddleware, roleController.updateRole); // Reuse/adapt validation

/**
 * @route   DELETE /api/roles/:id
 * @desc    Delete a role
 * @access  Admin Protected
 */
router.delete('/:id', roleController.deleteRole); // Add validation later if needed

module.exports = router;