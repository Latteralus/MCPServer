const express = require('express');
const authMiddleware = require('./middleware/auth');
const errorMiddleware = require('./middleware/errorHandler');
const validationMiddleware = require('./middleware/validation');
const rateLimitMiddleware = require('./middleware/rateLimit');

// Import route handlers
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const channelRoutes = require('./routes/channelRoutes');
const messageRoutes = require('./routes/messageRoutes');
const auditRoutes = require('./routes/auditRoutes');
const config = require('./config');
const port = config.port;

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

  // Apply rate limiting to all routes
  apiRouter.use(rateLimitMiddleware);

  // API version prefix
  apiRouter.use((req, res, next) => {
    req.apiVersion = 'v1';
    next();
  });

  // Unprotected routes
  apiRouter.use('/auth', authRoutes);

  // Protected routes (require authentication)
  apiRouter.use('/users', authMiddleware, userRoutes);
  apiRouter.use('/channels', authMiddleware, channelRoutes);
  apiRouter.use('/messages', authMiddleware, messageRoutes);
  apiRouter.use('/audit', authMiddleware, auditRoutes);

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
  console.log('API Routes Initialized:');
  console.log('- Authentication Routes');
  console.log('- User Management Routes');
  console.log('- Channel Management Routes');
  console.log('- Message Routes');
  console.log('- Audit Logging Routes');
}

module.exports = initializeApiRoutes;