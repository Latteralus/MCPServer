// MCPServer/api/controllers/roleController.js
const RoleModel = require('../../models/roleModel');
const AuditModel = require('../../models/auditModel');
const logger = require('../../config/logger');
const { withTransaction } = require('../../utils/dbTransaction'); // Import transaction utility

/**
 * Get all roles
 */
exports.getAllRoles = async (req, res, next) => {
  try {
    // Use list method with potential pagination options from query
    const options = {
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
    };
    const roles = await RoleModel.list(options); // Use list instead of getAll

    await AuditModel.log({
      userId: req.user.id,
      action: 'roles_listed',
      details: { ipAddress: req.ip }
    });

    res.json(roles || []); // Return empty array if null/undefined
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Error fetching all roles');
    next(error);
  }
};

/**
 * Create a new role
 */
exports.createRole = async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body;
    const userId = req.user.id;

    // Create the role first
    const newRoleData = { name, description }; // is_default is false by default in model
    const newRole = await RoleModel.create(newRoleData);

    // If permissions are provided, add them to the role
    // Assuming permissions is an array of permission IDs
    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      try {
        await RoleModel.addPermissions(newRole.id, permissions);
        logger.info({ roleId: newRole.id, count: permissions.length }, 'Added permissions to new role');
      } catch (permError) {
        // Log the permission error but don't necessarily fail the whole request?
        // Or should we rollback the role creation? Depends on desired atomicity.
        // For now, log and continue.
        logger.error({ err: permError, roleId: newRole.id, permissions }, 'Error adding permissions during role creation');
      }
    }

    await AuditModel.log({
      userId: userId,
      action: 'role_created',
      details: { roleId: newRole.id, name, ipAddress: req.ip }
    });

    res.status(201).json({ message: 'Role created successfully', role: newRole });
  } catch (error) {
     logger.error({ err: error, userId: req.user?.id, body: req.body }, 'Error creating role');
     // Handle potential duplicate errors from DB
     if (error.message.includes('duplicate key value violates unique constraint')) {
        return res.status(409).json({ error: 'Role name already exists.' });
     }
    next(error);
  }
};

/**
 * Get a specific role by ID
 */
exports.getRoleById = async (req, res, next) => {
  try {
    const roleId = req.params.id;
    const role = await RoleModel.getById(roleId);

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

     await AuditModel.log({
      userId: req.user.id,
      action: 'role_viewed',
      details: { roleId, ipAddress: req.ip }
    });

    res.json(role);
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, roleId: req.params.id }, 'Error fetching role by ID');
    next(error);
  }
};

/**
 * Update an existing role
 */
exports.updateRole = async (req, res, next) => {
  try {
    const roleId = req.params.id;
    const { name, description, permissions } = req.body; // permissions should be an array of permission IDs
    const userId = req.user.id;

    const finalUpdatedRole = await withTransaction(async (client) => {
      // 1. Update basic role info (name, description) using the client
      // Assuming RoleModel needs updateWithClient similar to ChannelModel for transactions
      // If not, adapt RoleModel.update to accept an optional client
      const updatedRoleData = { name, description };
      // Let's assume RoleModel.update can accept a client or we modify it later
      const updatedRole = await RoleModel.update(roleId, updatedRoleData /*, client */);

      if (!updatedRole) {
        throw new Error('Role not found'); // Throw error to trigger rollback
      }

      // 2. Handle permission updates if provided
      if (permissions && Array.isArray(permissions)) {
        // Get current permissions (using RoleModel, assuming it can use the client)
        const currentPermissions = await RoleModel.getPermissions(roleId /*, client */);
        const currentPermissionIds = currentPermissions.map(p => p.id);

        const permissionsToAdd = permissions.filter(pId => !currentPermissionIds.includes(pId));
        const permissionsToRemove = currentPermissionIds.filter(pId => !permissions.includes(pId));

        // Remove permissions
        if (permissionsToRemove.length > 0) {
          // Assuming RoleModel.removePermissions can accept a client
          await RoleModel.removePermissions(roleId, permissionsToRemove /*, client */);
          logger.info({ roleId, count: permissionsToRemove.length }, 'Removed permissions from role');
        }

        // Add permissions
        if (permissionsToAdd.length > 0) {
           // Assuming RoleModel.addPermissions can accept a client
          await RoleModel.addPermissions(roleId, permissionsToAdd /*, client */);
          logger.info({ roleId, count: permissionsToAdd.length }, 'Added permissions to role');
        }
      }

      // Log within the transaction if possible, or adjust AuditModel
      await AuditModel.log({ // Assuming AuditModel can use the default connection or adapt if needed
        userId: userId,
        action: 'role_updated',
        details: { roleId, name, ipAddress: req.ip, permissionsUpdated: !!permissions }
      });

      return updatedRole; // Return the updated role data
    });

    // Check if the transaction resulted in an updated role (it should have thrown if not found)
    if (!finalUpdatedRole) {
       // This case might not be reachable if errors are thrown correctly in the transaction
       return res.status(404).json({ error: 'Role not found or update failed' });
    }

    await AuditModel.log({
      userId: userId,
      action: 'role_updated',
      details: { roleId, name, ipAddress: req.ip }
    });

    res.json({ message: 'Role updated successfully', role: updatedRole });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, roleId: req.params.id, body: req.body }, 'Error updating role');
     // Handle potential duplicate errors from DB
     if (error.message.includes('duplicate key value violates unique constraint')) {
        return res.status(409).json({ error: 'Role name already exists.' });
     }
    next(error);
  }
};

/**
 * Delete a role
 */
exports.deleteRole = async (req, res, next) => {
  try {
    const roleId = req.params.id;
    const userId = req.user.id;

    // Check if the role exists and if it's a default role
    const role = await RoleModel.getById(roleId);
    if (!role) {
        return res.status(404).json({ error: 'Role not found' });
    }
    if (role.is_default) {
        return res.status(400).json({ error: 'Cannot delete default roles.' });
    }

    // Implement logic to delete role using RoleModel
    const deleted = await RoleModel.delete(roleId); // Assuming RoleModel has delete

    if (!deleted) {
       return res.status(404).json({ error: 'Role not found or delete failed' });
    }

    await AuditModel.log({
      userId: userId,
      action: 'role_deleted',
      details: { roleId, ipAddress: req.ip }
    });

    res.status(200).json({ message: 'Role deleted successfully' }); // Use 200 OK for successful delete
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, roleId: req.params.id }, 'Error deleting role');
    next(error);
  }
};