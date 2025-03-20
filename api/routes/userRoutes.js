const express = require('express');
const router = express.Router();

// Import user controller and validation utilities
const userController = require('../controllers/userController');
const { validationMiddleware, ValidationRules } = require('../middleware/validation');

/**
 * @route   GET /users
 * @desc    Retrieve a list of all users
 * @access  Protected (authentication applied in index.js)
 */
router.get('/', userController.getAllUsers);

/**
 * @route   GET /users/:id
 * @desc    Retrieve a single user by ID
 * @access  Protected
 */
router.get('/:id', userController.getUserById);

/**
 * @route   POST /users
 * @desc    Create a new user
 * @access  Protected
 */
router.post('/', ValidationRules.createUser, validationMiddleware, userController.createUser);

/**
 * @route   PUT /users/:id
 * @desc    Update an existing user by ID
 * @access  Protected
 */
router.put('/:id', ValidationRules.createUser, validationMiddleware, userController.updateUser);

/**
 * @route   DELETE /users/:id
 * @desc    Delete a user by ID
 * @access  Protected
 */
router.delete('/:id', userController.deleteUser);

module.exports = router;
