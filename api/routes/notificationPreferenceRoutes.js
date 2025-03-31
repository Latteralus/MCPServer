// MCPServer/api/routes/notificationPreferenceRoutes.js
const express = require('express');
const notificationPrefController = require('../controllers/notificationPreferenceController');
const { authenticateToken } = require('../middleware/authMiddleware');
// Assuming permission middleware exists and is needed, otherwise just use authenticateToken
// const { authorize } = require('../middleware/permissionMiddleware');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/notification-preferences - Get all preferences for the current user
router.get('/', notificationPrefController.getPreferences);

// PUT /api/notification-preferences - Set/Update one or more preferences for the current user
router.put('/', notificationPrefController.setPreferences);

// DELETE /api/notification-preferences - Delete a specific preference for the current user
// Context details are expected in query params or body (e.g., ?contextType=channel&contextId=uuid)
router.delete('/', notificationPrefController.deletePreference);


module.exports = router;