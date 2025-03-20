const AuditModel = require('../../models/auditModel');

/**
 * Centralized error handling middleware
 * @param {Error} err - Error object
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Next middleware function
 */
async function errorMiddleware(err, req, res, next) {
  // Determine error type and status code
  const statusCode = err.status || 500;
  const errorResponse = {
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  // Log the error
  try {
    await AuditModel.log({
      action: 'api_error',
      details: {
        path: req.path,
        method: req.method,
        errorMessage: err.message,
        statusCode,
        user: req.user ? req.user.id : 'unauthenticated'
      }
    });
  } catch (logError) {
    console.error('Error logging failed:', logError);
  }

  // Differentiate error responses based on environment
  if (process.env.NODE_ENV === 'production') {
    // In production, remove potentially sensitive error details
    delete errorResponse.stack;
  }

  // Different handling for various error types
  switch (statusCode) {
    case 400:
      errorResponse.message = 'Bad Request: Invalid input';
      break;
    case 401:
      errorResponse.message = 'Unauthorized: Authentication required';
      break;
    case 403:
      errorResponse.message = 'Forbidden: Insufficient permissions';
      break;
    case 404:
      errorResponse.message = 'Not Found: Resource does not exist';
      break;
    case 500:
      errorResponse.message = 'Server Error: Something went wrong';
      break;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

module.exports = errorMiddleware;