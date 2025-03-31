const express = require('express');
const { body } = require('express-validator');
const AuthService = require('../../services/authService');
const { validationMiddleware, ValidationRules } = require('../middleware/validation');
const AuditModel = require('../../models/auditModel');

const router = express.Router();

/**
 * User Login Route
 * Handles user authentication and token generation
 */
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validationMiddleware
], async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const ipAddress = req.ip;

    // Attempt authentication by validating credentials
    const user = await AuthService.validateCredentials(username, password); // Corrected method call

    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid username or password' 
      });
    }

    // Generate session token
    const token = AuthService.generateSessionToken(user);

    // Log successful login
    await AuditModel.log({
      userId: user.id,
      action: 'login_success',
      details: { ipAddress }
    });

    // Return user info and token
    res.json({
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      token
    });
  } catch (error) {
    // Log login error
    await AuditModel.log({
      action: 'login_error',
      details: { 
        username: req.body.username,
        error: error.message,
        ipAddress: req.ip
      }
    });

    next(error);
  }
});

/*
 * User Registration Route (DISABLED - Users should be created by Admin via POST /api/users)
 * Handles new user account creation
 */
/*
router.post('/register', [
  ...ValidationRules.createUser,
  validationMiddleware
], async (req, res, next) => {
  try {
    const { username, email, password, firstName, lastName } = req.body;
    const ipAddress = req.ip;

    // Attempt user registration
    const newUser = await AuthService.registerUser({
      username,
      email,
      password,
      firstName,
      lastName
    }, ipAddress);

    // Log successful registration
    await AuditModel.log({
      userId: newUser.id,
      action: 'user_registered',
      details: {
        username,
        email,
        ipAddress
      }
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email
      }
    });
  } catch (error) {
    // Log registration error
    await AuditModel.log({
      action: 'registration_error',
      details: {
        username: req.body.username,
        error: error.message,
        ipAddress: req.ip
      }
    });

    next(error);
  }
});
*/

/**
 * Password Change Route
 * Allows authenticated users to change their password
 */
router.post('/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/\d/).withMessage('New password must contain a number')
    .matches(/[A-Z]/).withMessage('New password must contain an uppercase letter'),
  validationMiddleware
], async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    const ipAddress = req.ip;

    // Attempt password change
    const changed = await AuthService.changePassword(
      userId, 
      currentPassword, 
      newPassword
    );

    if (!changed) {
      return res.status(400).json({ 
        error: 'Password change failed' 
      });
    }

    // Log password change
    await AuditModel.log({
      userId,
      action: 'password_changed',
      details: { ipAddress }
    });

    res.json({ 
      message: 'Password changed successfully' 
    });
  } catch (error) {
    // Log password change error
    await AuditModel.log({
      userId: req.user?.id,
      action: 'password_change_error',
      details: { 
        error: error.message,
        ipAddress: req.ip
      }
    });

    next(error);
  }
});

/**
 * Token Refresh Route
 * Allows users to get a new authentication token
 */
router.post('/refresh-token', async (req, res, next) => {
  try {
    const currentToken = req.headers.authorization?.split(' ')[1];
    
    if (!currentToken) {
      return res.status(401).json({ 
        error: 'No token provided' 
      });
    }

    // Validate and refresh token
    const newToken = await AuthService.refreshToken(currentToken);

    if (!newToken) {
      return res.status(401).json({ 
        error: 'Invalid or expired token' 
      });
    }

    // Log token refresh
    await AuditModel.log({
      action: 'token_refreshed',
      details: { ipAddress: req.ip }
    });

    res.json({ token: newToken });
  } catch (error) {
    // Log token refresh error
    await AuditModel.log({
      action: 'token_refresh_error',
      details: { 
        error: error.message,
        ipAddress: req.ip
      }
    });

    next(error);
  }
});

module.exports = router;