// MCPServer/api/routes/departmentRoutes.js
const express = require('express');
const departmentController = require('../controllers/departmentController');
const { authenticateToken } = require('../middleware/authMiddleware');
// TODO: Verify or implement permission middleware and permission names
const { authorize } = require('../middleware/permissionMiddleware'); // Assuming a permission middleware exists

const router = express.Router();

// Middleware: Ensure user is authenticated and has permission to manage departments
// Adjust the permission name as needed (e.g., 'admin.departments', 'department.manage')
// For now, let's assume a permission like 'admin.manage_departments' is needed for CUD operations.
// Listing might be allowed for more roles depending on requirements.
const canManageDepartments = authorize('admin.manage_departments'); // Example permission

// GET /api/departments - List all departments
// Accessible to any authenticated user for selection purposes (e.g., in user creation form)
router.get(
    '/',
    authenticateToken,
    departmentController.getAllDepartments
);

// POST /api/departments - Create a new department (Admin/Manager only)
router.post(
    '/',
    authenticateToken,
    canManageDepartments,
    departmentController.createDepartment
);

// GET /api/departments/:id - Get a specific department
// Accessible to any authenticated user
router.get(
    '/:id',
    authenticateToken,
    departmentController.getDepartmentById
);

// PUT /api/departments/:id - Update a department (Admin/Manager only)
router.put(
    '/:id',
    authenticateToken,
    canManageDepartments,
    departmentController.updateDepartment
);

// DELETE /api/departments/:id - Delete a department (Admin/Manager only)
router.delete(
    '/:id',
    authenticateToken,
    canManageDepartments,
    departmentController.deleteDepartment
);

module.exports = router;