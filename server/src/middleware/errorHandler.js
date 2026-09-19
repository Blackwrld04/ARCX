import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export function errorHandler(err, req, res, _next) {
  const isProduction = config.nodeEnv === 'production';

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

  const statusCode = err.statusCode || err.status || 500;

  const response = {
    error: 'INTERNAL_ERROR',
    message: isProduction
      ? 'An unexpected error occurred. Please try again.'
      : err.message,
  };

  if (!isProduction) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
