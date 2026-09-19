import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { config } from './config.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './db/init.js';
import { initUsdcDomain } from './utils/arc.js';
import { publicClient } from './facilitator/settle.js';
import { x402Gate } from './middleware/x402Gate.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

import insightRouter from './routes/insight.js';
import lookupRouter from './routes/lookup.js';
import statsRouter from './routes/stats.js';
import healthRouter from './routes/health.js';
import { initThreatFeedService } from './services/threatFeedService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ---------------------
// Security & parsing
// ---------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://code.iconify.design", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
      connectSrc: ["'self'", "https://api.iconify.design", "https://api.simplesvg.com", "https://api.unisvg.com"],
    },
  },
}));
app.use(cors());
app.use(express.json({ limit: '16kb' }));

// URL normalization (strip accidental spaces or double slashes from copy-pasting)
app.use((req, res, next) => {
  if (req.url.includes('%20') || req.url.includes(' ') || req.url.includes('//')) {
    const cleaned = req.url.replace(/(%20|\s)+/g, '').replace(/\/+/g, '/');
    if (cleaned !== req.url) {
      req.url = cleaned;
    }
  }
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      ms: Date.now() - start,
      ip: req.ip,
    }, `${req.method} ${req.url} ${res.statusCode}`);
  });
  next();
});

// ---------------------
// Rate limiting (global)
// ---------------------
app.use('/api', rateLimiter);

// ---------------------
// Free endpoints
// ---------------------
app.use('/health', healthRouter);
app.use('/api/v1/stats', statsRouter);
app.use('/stats', statsRouter);

// ---------------------
// Paywalled endpoints
// ---------------------
app.use('/api/v1/insight', x402Gate({ description: 'Random threat intelligence insight' }), insightRouter);
app.use('/api/v1/lookup',  x402Gate({ description: 'CVE lookup by ID' }), lookupRouter);

// ---------------------
// Root entrypoint: Developer Portal (HTML) or API metadata (JSON)
// ---------------------
app.get('/', (req, res) => {
  if (req.accepts('html')) {
    return res.sendFile(join(__dirname, '../public/index.html'));
  }
  res.json({
    name: 'ArcX',
    description: 'ArcX — x402-powered cybersecurity threat intelligence API on Arc mainnet',
    version: '1.0.0',
    docs: '/api/v1/stats',
    dashboard: '/dashboard',
    health: '/health',
  });
});

// ---------------------
// Public Developer Portal & Dashboard (static files)
// ---------------------
app.use(express.static(join(__dirname, '../public')));
app.use('/dashboard', express.static(join(__dirname, '../dashboard')));

// ---------------------
// 404 handler
// ---------------------
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `${req.method} ${req.url} does not exist. Try /api/v1/stats for API documentation.`,
  });
});

// ---------------------
// Error handler
// ---------------------
app.use(errorHandler);

// ---------------------
// Startup lifecycle
// ---------------------
let server;

async function start() {
  try {
    // 1. Initialize SQLite database & execute versioned migrations
    initDatabase();

    // 2. Initialize dynamic EIP-712 domain from live USDC contract
    await initUsdcDomain(publicClient);

    // 3. Initialize threat intelligence feeds (CISA KEV catalog sync & live APIs)
    initThreatFeedService();

    // 4. Start HTTP server
    server = app.listen(config.port, () => {
      logger.info({
        port: config.port,
        env: config.nodeEnv,
        payTo: config.payToAddress,
        price: `${(parseInt(config.pricePerCall) / 1_000_000).toFixed(6)} USDC`,
      }, `ArcX listening on port ${config.port}`);
    });
  } catch (err) {
    logger.fatal({ err: err.message }, 'Failed to start ArcX server');
    process.exit(1);
  }
}

// ---------------------
// Graceful shutdown
// ---------------------
function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received');
  if (server) {
    server.close(() => {
      closeDatabase();
      logger.info('Server shut down gracefully');
      process.exit(0);
    });
  } else {
    closeDatabase();
    process.exit(0);
  }

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
