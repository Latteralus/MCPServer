// MCPServer/api/controllers/departmentController.js
const DepartmentModel = require('../../models/departmentModel');
const AuditModel = require('../../models/auditModel');
const logger = require('../../config/logger');

/**
 * Get all departments
 */
exports.getAllDepartments = async (req, res, next) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 100, // Default limit
      offset: parseInt(req.query.offset) || 0
    };
    const departments = await DepartmentModel.list(options);

    // Optional: Log listing action if needed for audit
    // await AuditModel.log({
    //   userId: req.user.id, // Assuming user is authenticated for this route
    //   action: 'departments_listed',
    //   details: { ipAddress: req.ip }
    // });

    res.json(departments || []); // Return empty array if null/undefined
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Error fetching all departments');
    next(error);
  }
};

/**
 * Create a new department
 */
exports.createDepartment = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const userId = req.user.id; // Assuming admin authentication middleware

    if (!name) {
      return res.status(400).json({ error: 'Department name is required.' });
    }

    const newDepartmentData = { name, description };
    const newDepartment = await DepartmentModel.create(newDepartmentData);

    await AuditModel.log({
      userId: userId,
      action: 'department_created',
      details: { departmentId: newDepartment.id, name, ipAddress: req.ip }
    });

    res.status(201).json({ message: 'Department created successfully', department: newDepartment });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, body: req.body }, 'Error creating department');
    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    next(error);
  }
};

/**
 * Get a specific department by ID
 */
exports.getDepartmentById = async (req, res, next) => {
  try {
    const departmentId = req.params.id;
    const department = await DepartmentModel.getById(departmentId);

    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // Optional: Log view action if needed
    // await AuditModel.log({
    //   userId: req.user.id,
    //   action: 'department_viewed',
    //   details: { departmentId, ipAddress: req.ip }
    // });

    res.json(department);
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, departmentId: req.params.id }, 'Error fetching department by ID');
    next(error);
  }
};

/**
 * Update an existing department
 */
exports.updateDepartment = async (req, res, next) => {
  try {
    const departmentId = req.params.id;
    const { name, description } = req.body;
    const userId = req.user.id; // Assuming admin authentication

    if (!name && !description) {
        return res.status(400).json({ error: 'No update data provided (name or description required).' });
    }

    const updateData = { name, description };
    const updatedDepartment = await DepartmentModel.update(departmentId, updateData);

    if (!updatedDepartment) {
      return res.status(404).json({ error: 'Department not found' });
    }

    await AuditModel.log({
      userId: userId,
      action: 'department_updated',
      details: { departmentId, name: updatedDepartment.name, ipAddress: req.ip }
    });

    res.json({ message: 'Department updated successfully', department: updatedDepartment });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, departmentId: req.params.id, body: req.body }, 'Error updating department');
    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    next(error);
  }
};

/**
 * Delete a department
 */
exports.deleteDepartment = async (req, res, next) => {
  try {
    const departmentId = req.params.id;
    const userId = req.user.id; // Assuming admin authentication

    // Model handles checking for assigned users before deletion
    const deleted = await DepartmentModel.delete(departmentId);

    if (!deleted) {
       // This could mean not found or deletion failed (e.g., users assigned, caught by model)
       // The model throws specific error for assigned users, so check that first
       // If we reach here without that error, it means not found.
       return res.status(404).json({ error: 'Department not found' });
    }

    await AuditModel.log({
      userId: userId,
      action: 'department_deleted',
      details: { departmentId, ipAddress: req.ip }
    });

    res.status(200).json({ message: 'Department deleted successfully' });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, departmentId: req.params.id }, 'Error deleting department');
     if (error.message === 'Cannot delete department: Users are assigned to it.') {
        return res.status(400).json({ error: error.message });
     }
    next(error);
  }
};