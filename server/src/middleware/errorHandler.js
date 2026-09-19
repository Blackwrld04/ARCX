import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Global error handler.
 *
 * - Never leaks stack traces in production.
 * - Returns structured JSON error responses.
 * - Logs full error details server-side.
 */
export function errorHandler(err, req, res, _next) {
  const isProduction = config.nodeEnv === 'production';

  // Log the full error
  logger.error({
    err: {
      message: err.message,
      stack: err.stack,
      code: err.code,
    },
    method: req.method,
    url: req.url,
    ip: req.ip,
  }, 'Unhandled error');

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Build response
  const response = {
    error: 'INTERNAL_ERROR',
    message: isProduction
      ? 'An unexpected error occurred. Please try again.'
      : err.message,
  };

  // Add stack trace in development
  if (!isProduction) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
