const express = require('express');
const router = express.Router();

// Import channel controller and validation utilities
const channelController = require('../controllers/channelController');
const { validationMiddleware, ValidationRules } = require('../middleware/validation');

/**
 * @route   GET /channels
 * @desc    Retrieve all channels
 * @access  Protected (authentication applied in index.js)
 */
router.get('/', channelController.getAllChannels);

/**
 * @route   GET /channels/:id
 * @desc    Retrieve a single channel by ID
 * @access  Protected
 */
router.get('/:id', channelController.getChannelById);

/**
 * @route   POST /channels
 * @desc    Create a new channel
 * @access  Protected
 */
router.post('/', ValidationRules.createChannel, validationMiddleware, channelController.createChannel);

/**
 * @route   PUT /channels/:id
 * @desc    Update an existing channel by ID
 * @access  Protected
 */
router.put('/:id', ValidationRules.createChannel, validationMiddleware, channelController.updateChannel);

/**
 * @route   DELETE /channels/:id
 * @desc    Delete a channel by ID
 * @access  Protected
 */
router.delete('/:id', channelController.deleteChannel);

module.exports = router;
