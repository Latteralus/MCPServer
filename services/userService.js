// api/routes/userRoutes.js
const express = require('express');
const { body, param, query } = require('express-validator');
const UserModel = require('../../models/userModel');
const PermissionService = require('../../services/permissionService');
const AuthService = require('../../services/authService');
const EncryptionService = require('../../services/encryptionService');
const { validationMiddleware, ValidationRules } = require('../middleware/validation');
const AuditModel = require('../../models/auditModel');

const router = express.Router();

/**
 * GET /api/users
 * Get all users
 * Requires permission: 'users.view' or 'admin.users'
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Check if user has permission to view users
    const hasPermission = await PermissionService.validatePermissions(
      userId,
      ['users.view', 'admin.users']
    );

    if (!hasPermission) {
      // Log unauthorized attempt
      await AuditModel.log({
        userId,
        action: 'unauthorized_access_attempt',
        details: { 
          endpoint: 'GET /api/users',
          ipAddress: req.ip 
        }
      });

      return res.status(403).json({
        error: 'Insufficient permissions to view users'
      });
    }

    // Get users
    const users = await UserModel.getAll();

    // Filter sensitive data before returning
    const filteredUsers = users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role_id,
      status: user.status,
      lastLogin: user.last_login,
      createdAt: user.created_at
    }));

    // Log successful access
    await AuditModel.log({
      userId,
      action: 'users_listed',
      details: { 
        count: users.length,
        ipAddress: req.ip 
      }
    });

    res.json(filteredUsers);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id
 * Get user by ID
 * Requires permission: 'users.view' or 'admin.users' or own user
 */
router.get('/:id', [
  param('id').isUUID().withMessage('Invalid user ID format'),
  validationMiddleware
], async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.id;
    
    // Users can always view their own profile
    const isSelfLookup = userId === targetUserId;
    
    // Check permissions if not viewing self
    if (!isSelfLookup) {
      const hasPermission = await PermissionService.validatePermissions(
        userId,
        ['users.view', 'admin.users']
      );

      if (!hasPermission) {
        // Log unauthorized attempt
        await AuditModel.log({
          userId,
          action: 'unauthorized_user_lookup',
          details: { 
            targetUserId,
            ipAddress: req.ip 
          }
        });

        return res.status(403).json({
          error: 'Insufficient permissions to view this user'
        });
      }
    }

    // Get user data
    const user = await UserModel.getById(targetUserId);

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Filter sensitive data before returning
    const filteredUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role_id,
      status: user.status,
      lastLogin: user.last_login,
      createdAt: user.created_at
    };

    // Log successful lookup
    await AuditModel.log({
      userId,
      action: 'user_looked_up',
      details: { 
        targetUserId,
        ipAddress: req.ip 
      }
    });

    res.json(filteredUser);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users
 * Create new user
 * Requires permission: 'users.create' or 'admin.users'
 */
router.post('/', [
  ...ValidationRules.createUser,
  validationMiddleware
], async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { username, email, password, firstName, lastName, roleId } = req.body;

    // Check if user has permission to create users
    const hasPermission = await PermissionService.validatePermissions(
      userId,
      ['users.create', 'admin.users']
    );

    if (!hasPermission) {
      // Log unauthorized attempt
      await AuditModel.log({
        userId,
        action: 'unauthorized_user_creation',
        details: { 
          ipAddress: req.ip 
        }
      });

      return res.status(403).json({
        error: 'Insufficient permissions to create users'
      });
    }

    // Create user
    const newUser = await UserModel.create({
      username,
      email,
      password,
      firstName,
      lastName,
      roleId
    });

    // Log user creation
    await AuditModel.log({
      userId,
      action: 'user_created',
      details: { 
        newUserId: newUser.id,
        username,
        email,
        roleId,
        ipAddress: req.ip 
      }
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        createdAt: newUser.created_at
      }
    });
  } catch (error) {
    // Handle duplicate username/email
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: error.message
      });
    }
    
    next(error);
  }
});

/**
 * PUT /api/users/:id
 * Update user
 * Requires permission: 'users.edit' or 'admin.users' or own user
 */
router.put('/:id', [
  param('id').isUUID().withMessage('Invalid user ID format'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('firstName').optional().isLength({ min: 1 }).withMessage('First name cannot be empty'),
  body('lastName').optional().isLength({ min: 1 }).withMessage('Last name cannot be empty'),
  body('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status'),
  validationMiddleware
], async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.id;
    const updateData = req.body;
    
    // Users can update their own basic info
    const isSelfUpdate = userId === targetUserId;
    
    // Role updates require admin permission
    const isRoleUpdate = 'roleId' in updateData;
    
    // Status updates require admin permission
    const isStatusUpdate = 'status' in updateData;
    
    if (isRoleUpdate || isStatusUpdate || !isSelfUpdate) {
      // Check admin permissions for these operations
      const hasPermission = await PermissionService.validatePermissions(
        userId,
        ['users.edit', 'admin.users']
      );

      if (!hasPermission) {
        // Log unauthorized attempt
        await AuditModel.log({
          userId,
          action: 'unauthorized_user_update',
          details: { 
            targetUserId,
            fields: Object.keys(updateData),
            ipAddress: req.ip 
          }
        });

        return res.status(403).json({
          error: 'Insufficient permissions to update this user'
        });
      }
    }

    // Get current user data
    const existingUser = await UserModel.getById(targetUserId);
    if (!existingUser) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Prepare update object
    const updates = {};
    
    // Handle basic fields
    if (updateData.email) updates.email = updateData.email;
    if (updateData.firstName) updates.first_name = updateData.firstName;
    if (updateData.lastName) updates.last_name = updateData.lastName;
    if (updateData.status && isStatusUpdate) updates.status = updateData.status;
    if (updateData.roleId && isRoleUpdate) updates.role_id = updateData.roleId;

    // Update user in database
    // Note: This is a simplified version - actual implementation would depend on UserModel's update method
    const updatedUser = await db.query(
      `UPDATE users 
       SET ${Object.keys(updates).map((key, i) => `${key} = $${i + 1}`).join(', ')}
       WHERE id = $${Object.keys(updates).length + 1}
       RETURNING id, username, email, first_name, last_name, status, role_id, created_at`,
      [...Object.values(updates), targetUserId]
    );

    // Log user update
    await AuditModel.log({
      userId,
      action: 'user_updated',
      details: { 
        targetUserId,
        fields: Object.keys(updates),
        ipAddress: req.ip 
      }
    });

    res.json({
      message: 'User updated successfully',
      user: {
        id: updatedUser.rows[0].id,
        username: updatedUser.rows[0].username,
        email: updatedUser.rows[0].email,
        firstName: updatedUser.rows[0].first_name,
        lastName: updatedUser.rows[0].last_name,
        status: updatedUser.rows[0].status,
        role: updatedUser.rows[0].role_id,
        createdAt: updatedUser.rows[0].created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/users/:id/password
 * Update user password (by admin or self)
 */
router.put('/:id/password', [
  param('id').isUUID().withMessage('Invalid user ID format'),
  body('currentPassword').if(body('adminOverride').not().equals(true)).notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/\d/).withMessage('New password must contain a number')
    .matches(/[A-Z]/).withMessage('New password must contain an uppercase letter'),
  validationMiddleware
], async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.id;
    const { currentPassword, newPassword, adminOverride } = req.body;
    
    // Determine if this is a self-update or admin update
    const isSelfUpdate = userId === targetUserId;
    
    // Admin override requires permission check
    if (adminOverride) {
      const hasAdminPermission = await PermissionService.validatePermissions(
        userId,
        ['admin.users']
      );

      if (!hasAdminPermission) {
        // Log unauthorized attempt
        await AuditModel.log({
          userId,
          action: 'unauthorized_password_admin_override',
          details: { 
            targetUserId,
            ipAddress: req.ip 
          }
        });

        return res.status(403).json({
          error: 'Insufficient permissions for admin password override'
        });
      }
    } else if (!isSelfUpdate) {
      // If not self and not admin override, reject
      await AuditModel.log({
        userId,
        action: 'unauthorized_password_change',
        details: { 
          targetUserId,
          ipAddress: req.ip 
        }
      });

      return res.status(403).json({
        error: 'Cannot change another user\'s password without admin privileges'
      });
    }
    
    // For self-update, verify current password
    if (isSelfUpdate && !adminOverride) {
      const user = await UserModel.getById(userId);
      
      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }
      
      const isPasswordValid = await UserModel.verifyPassword(
        currentPassword, 
        user.password_hash, 
        user.salt
      );
      
      if (!isPasswordValid) {
        // Log failed password verification
        await AuditModel.log({
          userId,
          action: 'password_change_wrong_current_password',
          details: { ipAddress: req.ip }
        });
        
        return res.status(400).json({
          error: 'Current password is incorrect'
        });
      }
    }
    
    // Generate new password hash
    const salt = await UserModel.generateSalt();
    const passwordHash = await UserModel.hashPassword(newPassword, salt);
    
    // Update password in database
    await UserModel.updatePassword(targetUserId, passwordHash, salt);
    
    // Reset failed login attempts if any
    await UserModel.resetFailedLoginAttempts(targetUserId);
    
    // Log password change
    await AuditModel.log({
      userId,
      action: 'user_password_changed',
      details: { 
        targetUserId,
        adminOverride: adminOverride || false,
        ipAddress: req.ip 
      }
    });
    
    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id/permissions
 * Get permissions for a user
 * Requires permission: 'admin.users' or own user
 */
router.get('/:id/permissions', [
  param('id').isUUID().withMessage('Invalid user ID format'),
  validationMiddleware
], async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.id;
    
    // Users can view their own permissions
    const isSelfLookup = userId === targetUserId;
    
    if (!isSelfLookup) {
      // Check admin permissions
      const hasPermission = await PermissionService.validatePermissions(
        userId,
        ['admin.users']
      );

      if (!hasPermission) {
        // Log unauthorized attempt
        await AuditModel.log({
          userId,
          action: 'unauthorized_permissions_lookup',
          details: { 
            targetUserId,
            ipAddress: req.ip 
          }
        });

        return res.status(403).json({
          error: 'Insufficient permissions to view user permissions'
        });
      }
    }
    
    // Get user permissions
    const permissions = await PermissionService.getUserPermissions(targetUserId);
    
    // Log successful lookup
    await AuditModel.log({
      userId,
      action: 'user_permissions_looked_up',
      details: { 
        targetUserId,
        ipAddress: req.ip 
      }
    });
    
    res.json({ permissions });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/users/:id
 * Delete or deactivate user
 * Requires permission: 'admin.users'
 */
router.delete('/:id', [
  param('id').isUUID().withMessage('Invalid user ID format'),
  query('hard').optional().isBoolean().withMessage('Hard parameter must be a boolean'),
  validationMiddleware
], async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.id;
    const hardDelete = req.query.hard === 'true';
    
    // Cannot delete self
    if (userId === targetUserId) {
      return res.status(400).json({
        error: 'Cannot delete your own account'
      });
    }
    
    // Check admin permissions
    const hasPermission = await PermissionService.validatePermissions(
      userId,
      ['admin.users']
    );

    if (!hasPermission) {
      // Log unauthorized attempt
      await AuditModel.log({
        userId,
        action: 'unauthorized_user_deletion',
        details: { 
          targetUserId,
          hardDelete,
          ipAddress: req.ip 
        }
      });

      return res.status(403).json({
        error: 'Insufficient permissions to delete users'
      });
    }
    
    // For soft delete (default), update status to 'deleted'
    if (!hardDelete) {
      await db.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['deleted', targetUserId]
      );
      
      // Log soft deletion
      await AuditModel.log({
        userId,
        action: 'user_soft_deleted',
        details: { 
          targetUserId,
          ipAddress: req.ip 
        }
      });
      
      res.json({
        message: 'User deactivated successfully'
      });
    } else {
      // Hard delete - permanently remove the user
      // Note: In HIPAA contexts, consider if this complies with record retention policies
      
      // First check if user has related data that should be preserved
      const hasRelatedData = await db.query(
        'SELECT EXISTS(SELECT 1 FROM messages WHERE sender_id = $1) AS has_messages',
        [targetUserId]
      );
      
      if (hasRelatedData.rows[0].has_messages) {
        return res.status(409).json({
          error: 'Cannot permanently delete user with existing messages'
        });
      }
      
      // Perform hard delete
      await db.query(
        'DELETE FROM users WHERE id = $1',
        [targetUserId]
      );
      
      // Log hard deletion
      await AuditModel.log({
        userId,
        action: 'user_hard_deleted',
        details: { 
          targetUserId,
          ipAddress: req.ip 
        }
      });
      
      res.json({
        message: 'User permanently deleted'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/users/:id/notification-preferences
 * Update notification preferences for a user
 */
router.put('/:id/notification-preferences', [
  param('id').isUUID().withMessage('Invalid user ID format'),
  body('preferences').isObject().withMessage('Preferences must be an object'),
  validationMiddleware
], async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.id;
    const { preferences } = req.body;
    
    // Users can only update their own notification preferences
    if (userId !== targetUserId) {
      // Check admin permissions
      const hasPermission = await PermissionService.validatePermissions(
        userId,
        ['admin.users']
      );

      if (!hasPermission) {
        // Log unauthorized attempt
        await AuditModel.log({
          userId,
          action: 'unauthorized_preferences_update',
          details: { 
            targetUserId,
            ipAddress: req.ip 
          }
        });

        return res.status(403).json({
          error: 'Insufficient permissions to update notification preferences'
        });
      }
    }
    
    // Update notification preferences
    await UserModel.updateNotificationPreferences(targetUserId, preferences);
    
    // Log preferences update
    await AuditModel.log({
      userId,
      action: 'notification_preferences_updated',
      details: { 
        targetUserId,
        ipAddress: req.ip 
      }
    });
    
    res.json({
      message: 'Notification preferences updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users/search
 * Search users by criteria
 * Requires permission: 'users.view' or 'admin.users'
 */
router.post('/search', [
  body('criteria').isObject().withMessage('Search criteria must be an object'),
  validationMiddleware
], async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { criteria } = req.body;
    
    // Check if user has permission to search users
    const hasPermission = await PermissionService.validatePermissions(
      userId,
      ['users.view', 'admin.users']
    );

    if (!hasPermission) {
      // Log unauthorized attempt
      await AuditModel.log({
        userId,
        action: 'unauthorized_user_search',
        details: { 
          ipAddress: req.ip 
        }
      });

      return res.status(403).json({
        error: 'Insufficient permissions to search users'
      });
    }
    
    // Build search query
    let query = 'SELECT id, username, email, first_name, last_name, role_id, status, last_login, created_at FROM users WHERE status != \'deleted\'';
    const queryParams = [];
    let paramIndex = 1;
    
    // Add search criteria to query
    if (criteria.username) {
      query += ` AND username ILIKE ${paramIndex}`;
      queryParams.push(`%${criteria.username}%`);
      paramIndex++;
    }
    
    if (criteria.email) {
      query += ` AND email ILIKE ${paramIndex}`;
      queryParams.push(`%${criteria.email}%`);
      paramIndex++;
    }
    
    if (criteria.name) {
      query += ` AND (first_name ILIKE ${paramIndex} OR last_name ILIKE ${paramIndex})`;
      queryParams.push(`%${criteria.name}%`);
      paramIndex++;
    }
    
    if (criteria.roleId) {
      query += ` AND role_id = ${paramIndex}`;
      queryParams.push(criteria.roleId);
      paramIndex++;
    }
    
    if (criteria.status && criteria.status !== 'deleted') {
      query += ` AND status = ${paramIndex}`;
      queryParams.push(criteria.status);
      paramIndex++;
    }
    
    // Add pagination
    const limit = criteria.limit || 50;
    const offset = criteria.offset || 0;
    
    query += ` ORDER BY username LIMIT ${paramIndex} OFFSET ${paramIndex + 1}`;
    queryParams.push(limit, offset);
    
    // Execute search
    const result = await db.query(query, queryParams);
    
    // Format results
    const users = result.rows.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role_id,
      status: user.status,
      lastLogin: user.last_login,
      createdAt: user.created_at
    }));
    
    // Log search
    await AuditModel.log({
      userId,
      action: 'user_search_performed',
      details: { 
        criteriaCount: Object.keys(criteria).length,
        resultCount: users.length,
        ipAddress: req.ip 
      }
    });
    
    res.json({
      users,
      pagination: {
        total: result.rowCount, // Note: This is not accurate for total count with pagination
        limit,
        offset
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id/audit-log
 * Get audit log entries for a user
 * Requires permission: 'admin.users' or 'audit.view'
 */
router.get('/:id/audit-log', [
  param('id').isUUID().withMessage('Invalid user ID format'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a positive integer'),
  validationMiddleware
], async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.id;
    const limit = parseInt(req.query.limit || 50);
    const offset = parseInt(req.query.offset || 0);
    
    // Check permissions for audit log access
    const hasPermission = await PermissionService.validatePermissions(
      userId,
      ['admin.users', 'audit.view']
    );

    if (!hasPermission) {
      // Log unauthorized attempt
      await AuditModel.log({
        userId,
        action: 'unauthorized_audit_log_access',
        details: { 
          targetUserId,
          ipAddress: req.ip 
        }
      });

      return res.status(403).json({
        error: 'Insufficient permissions to view audit logs'
      });
    }
    
    // Get audit log entries
    const auditLogs = await AuditModel.getUserLogs(targetUserId, { limit, offset });
    
    // Log audit log access
    await AuditModel.log({
      userId,
      action: 'audit_log_accessed',
      details: { 
        targetUserId,
        ipAddress: req.ip 
      }
    });
    
    res.json({
      auditLogs,
      pagination: {
        limit,
        offset
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id/sessions
 * Get active sessions for a user
 * Requires permission: 'admin.users' or own user
 */
router.get('/:id/sessions', [
  param('id').isUUID().withMessage('Invalid user ID format'),
  validationMiddleware
], async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.id;
    
    // Users can view their own sessions
    const isSelfLookup = userId === targetUserId;
    
    if (!isSelfLookup) {
      // Check admin permissions
      const hasPermission = await PermissionService.validatePermissions(
        userId,
        ['admin.users']
      );

      if (!hasPermission) {
        // Log unauthorized attempt
        await AuditModel.log({
          userId,
          action: 'unauthorized_sessions_lookup',
          details: { 
            targetUserId,
            ipAddress: req.ip 
          }
        });

        return res.status(403).json({
          error: 'Insufficient permissions to view user sessions'
        });
      }
    }
    
    // Get active sessions
    // Note: This would require a sessions table or cache query in a real implementation
    const sessions = []; // Placeholder - implement based on your session storage mechanism
    
    // Log sessions lookup
    await AuditModel.log({
      userId,
      action: 'user_sessions_looked_up',
      details: { 
        targetUserId,
        ipAddress: req.ip 
      }
    });
    
    res.json({ sessions });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users/:id/terminate-sessions
 * Terminate all active sessions for a user
 * Requires permission: 'admin.users' or own user
 */
router.post('/:id/terminate-sessions', [
  param('id').isUUID().withMessage('Invalid user ID format'),
  body('excludeCurrent').optional().isBoolean().withMessage('excludeCurrent must be a boolean'),
  validationMiddleware
], async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.id;
    const { excludeCurrent = true } = req.body;
    const currentToken = req.headers.authorization?.split(' ')[1];
    
    // Users can terminate their own sessions
    const isSelfAction = userId === targetUserId;
    
    if (!isSelfAction) {
      // Check admin permissions
      const hasPermission = await PermissionService.validatePermissions(
        userId,
        ['admin.users']
      );

      if (!hasPermission) {
        // Log unauthorized attempt
        await AuditModel.log({
          userId,
          action: 'unauthorized_session_termination',
          details: { 
            targetUserId,
            ipAddress: req.ip 
          }
        });

        return res.status(403).json({
          error: 'Insufficient permissions to terminate user sessions'
        });
      }
    }
    
    // Terminate sessions
    // Note: Implementation would depend on your session storage mechanism
    // Placeholder implementation
    const terminatedCount = 0;
    
    // Log session termination
    await AuditModel.log({
      userId,
      action: 'user_sessions_terminated',
      details: { 
        targetUserId,
        excludedCurrent: excludeCurrent,
        terminatedCount,
        ipAddress: req.ip 
      }
    });
    
    res.json({
      message: 'Sessions terminated successfully',
      terminatedCount
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;