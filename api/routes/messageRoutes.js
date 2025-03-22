const express = require('express');
const router = express.Router();

// Import message controller and validation utilities
const messageController = require('../controllers/messageController');
const { validationMiddleware, ValidationRules } = require('../middleware/validation');

/**
 * @route   GET /messages
 * @desc    Retrieve all messages
 * @access  Protected (authentication applied in index.js)
 */
router.get('/', messageController.getAllMessages);

/**
 * @route   GET /messages/:id
 * @desc    Retrieve a single message by its ID
 * @access  Protected
 */
router.get('/:id', messageController.getMessageById);

/**
 * @route   POST /messages
 * @desc    Create a new message
 * @access  Protected
 */
router.post('/', ValidationRules.createMessage, validationMiddleware, messageController.createMessage);

/**
 * @route   PUT /messages/:id
 * @desc    Update an existing message by ID
 * @access  Protected
 */
router.put('/:id', ValidationRules.createMessage, validationMiddleware, messageController.updateMessage);

/**
 * @route   DELETE /messages/:id
 * @desc    Delete a message by ID
 * @access  Protected
 */
router.delete('/:id', messageController.deleteMessage);

module.exports = router;
