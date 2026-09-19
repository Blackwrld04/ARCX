import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export const rateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    const paymentHeader = req.headers['x-payment'];
    if (paymentHeader) {
      try {
        const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
        const payment = JSON.parse(decoded);
        if (payment.from) {
          return `wallet:${payment.from.toLowerCase()}`;
        }
      } catch {

      }
    }
    return `ip:${req.ip}`;
  },

  handler: (req, res) => {
    logger.warn({ ip: req.ip, key: req.rateLimit?.key }, 'Rate limit exceeded');
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down.',
      retryAfter: Math.ceil(config.rateLimitWindowMs / 1000),
    });
  },
});
