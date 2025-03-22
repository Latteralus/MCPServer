const { validationResult, body } = require('express-validator');

/**
 * Validation middleware to check request validation results
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Next middleware function
 */
function validationMiddleware(req, res, next) {
  // Check for validation errors
  const errors = validationResult(req);

  // If there are validation errors, return detailed error response
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Failed',
      details: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
        location: err.location
      }))
    });
  }

  // If no errors, proceed to next middleware
  next();
}

/**
 * Create validation rules for different request types
 */
const ValidationRules = {
  /**
   * User creation validation rules
   * @returns {Array} Validation rules for user creation
   */
  createUser: [
    // Username validation
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters')
      .isAlphanumeric().withMessage('Username must be alphanumeric'),
    
    // Email validation
    body('email')
      .trim()
      .isEmail().withMessage('Invalid email format')
      .normalizeEmail(),
    
    // Password validation
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/\d/).withMessage('Password must contain a number')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
  ],

  /**
   * Message creation validation rules
   * @returns {Array} Validation rules for message creation
   */
  createMessage: [
    body('channelId')
      .trim()
      .isUUID().withMessage('Invalid channel ID'),
    
    body('text')
      .trim()
      .isLength({ min: 1, max: 1000 }).withMessage('Message must be 1-1000 characters')
  ],

  /**
   * Channel creation validation rules
   * @returns {Array} Validation rules for channel creation
   */
  createChannel: [
    body('name')
      .trim()
      .isLength({ min: 3, max: 50 }).withMessage('Channel name must be 3-50 characters')
      .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Channel name can only contain letters, numbers, underscores, and hyphens')
  ]
};

// Export validation middleware and rules
module.exports = {
  validationMiddleware,
  ValidationRules
};