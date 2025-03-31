const express = require('express');
const authMiddleware = require('../middleware/auth');
const errorMiddleware = require('../middleware/errorHandler');
const { validationMiddleware } = require('../middleware/validation');
const { standardLimiter, authLimiter } = require('../middleware/rateLimit'); // Import specific limiters
const cookieParser = require('cookie-parser'); // Added for CSRF
const csrf = require('csurf'); // Added for CSRF
const logger = require('../../config/logger'); // Import logger

// Import route handlers
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const channelRoutes = require('./channelRoutes');
const messageRoutes = require('./messageRoutes');
const auditRoutes = require('./auditRoutes');
const roleRoutes = require('./roleRoutes'); // Added import for role routes
const departmentRoutes = require('./departmentRoutes'); // Import department routes
const notificationPreferenceRoutes = require('./notificationPreferenceRoutes'); // Import notification pref routes

/**
 * Initialize API routes for MCP Messenger
 * @param {express.Application} app - Express application
 */
function initializeApiRoutes(app) {
  // Create router
  const apiRouter = express.Router();

  // Global middleware for all API routes
  apiRouter.use(express.json());
  apiRouter.use(express.urlencoded({ extended: true }));
  apiRouter.use(cookieParser()); // Use cookie-parser

  // Setup CSRF protection using cookies
  const csrfProtection = csrf({ cookie: true });
  // Apply CSRF protection globally for now (can be refined per route later)
  // IMPORTANT: GET requests should ideally not require CSRF, but applying broadly for initial fix.
  apiRouter.use(csrfProtection);

  // Apply rate limiting to all routes
  // Rate limiting applied per route group below

  // API version prefix
  apiRouter.use((req, res, next) => {
    req.apiVersion = 'v1';
    next();
  });

  // Unprotected routes
  apiRouter.use('/auth', authLimiter, authRoutes); // Apply stricter limiter to auth routes

  // Protected routes (require authentication)
  apiRouter.use('/users', standardLimiter, authMiddleware, userRoutes); // Apply standard limiter
  apiRouter.use('/channels', standardLimiter, authMiddleware, channelRoutes); // Apply standard limiter
  apiRouter.use('/messages', standardLimiter, authMiddleware, messageRoutes); // Apply standard limiter
  apiRouter.use('/audit', standardLimiter, authMiddleware, auditRoutes); // Apply standard limiter
  apiRouter.use('/roles', standardLimiter, authMiddleware, roleRoutes); // Added role routes (protected)
  apiRouter.use('/departments', standardLimiter, authMiddleware, departmentRoutes); // Add department routes (protected)
  apiRouter.use('/notification-preferences', standardLimiter, authMiddleware, notificationPreferenceRoutes); // Add notification pref routes (protected)

  // Catch-all for undefined routes
  apiRouter.use((req, res, next) => {
    const error = new Error('API Endpoint Not Found');
    error.status = 404;
    next(error);
  });

  // Error handling middleware (must be last)
  apiRouter.use(errorMiddleware);

  // Mount API router
  app.use('/api', apiRouter);

  // Logging route registrations
  logger.info('API Routes Initialized: /auth, /users, /channels, /messages, /audit');

  return apiRouter;
}

module.exports = initializeApiRoutes;