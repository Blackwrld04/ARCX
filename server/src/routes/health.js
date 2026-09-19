import { Router } from 'express';
import { getFacilitatorBalance } from '../facilitator/settle.js';
import { getDb } from '../db/init.js';
import { config } from '../config.js';

const router = Router();
const startTime = Date.now();

/**
 * GET /health
 *
 * Free endpoint — system health check.
 * Reports server status, DB connectivity, RPC status, uptime.
 */
router.get('/', async (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const checks = {};

  // Database check
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    checks.database = { status: 'healthy' };
  } catch (err) {
    checks.database = { status: 'unhealthy', error: err.message };
  }

  // RPC check
  try {
    const balance = await getFacilitatorBalance();
    checks.rpc = {
      status: balance !== null ? 'healthy' : 'unhealthy',
      network: 'arc-mainnet',
      chainId: config.arcChainId,
    };
  } catch (err) {
    checks.rpc = { status: 'unhealthy', error: err.message };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === 'healthy');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    uptime: `${uptimeSeconds}s`,
    version: '1.0.0',
    checks,
  });
});

export default router;
