const express = require('express');
const router = express.Router();

// Import the audit controller
const auditController = require('../controllers/auditController');

/**
 * @route   GET /audit
 * @desc    Retrieve all audit log entries
 * @access  Protected (authentication applied in index.js)
 */
router.get('/', auditController.getAllAuditLogs);

/**
 * @route   GET /audit/:id
 * @desc    Retrieve a single audit log entry by ID
 * @access  Protected
 */
router.get('/:id', auditController.getAuditLogById);

module.exports = router;
