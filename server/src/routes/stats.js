import { Router } from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getStats, getRecentPayments } from '../db/ledger.js';
import { getFeedStats } from '../services/threatFeedService.js';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();
const startTime = Date.now();

router.get('/', (req, res) => {
  const wantsJson = req.query.format === 'json' ||
                    (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html')) ||
                    req.xhr;

  if (!wantsJson && req.accepts('html')) {
    return res.sendFile(join(__dirname, '../../public/stats/index.html'));
  }

  const stats = getStats();
  const feedStats = getFeedStats();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  res.json({
    service: 'ArcX',
    description: 'ArcX — x402-powered cybersecurity threat intelligence API on Arc mainnet',
    pricing: {
      perQuery: `${(parseInt(config.pricePerCall) / 1_000_000).toFixed(6)} USDC`,
      network: 'eip155:5042',
      chainId: config.arcChainId,
      asset: config.usdcAddress,
      payTo: config.payToAddress,
    },
    threatFeeds: feedStats,
    stats: {
      totalPayments: stats.totalPayments,
      totalSettled: stats.totalSettled,
      uniqueWallets: stats.uniqueWallets,
      totalRevenue: `${stats.totalRevenue} USDC`,
      paymentsLast24h: stats.paymentsLast24h,
      lastPayment: stats.lastPayment
        ? {
            txHash: stats.lastPayment.tx_hash,
            amount: `${(parseInt(stats.lastPayment.amount) / 1_000_000).toFixed(6)} USDC`,
            from: stats.lastPayment.from_address,
            endpoint: stats.lastPayment.endpoint,
            settledAt: stats.lastPayment.settled_at,
            explorerUrl: `https://explorer.arc.io/tx/${stats.lastPayment.tx_hash}`,
          }
        : null,
    },
    uptime: `${uptimeSeconds}s`,
    endpoints: {
      insight: {
        url: '/api/v1/insight',
        method: 'GET',
        paid: true,
        description: 'Random enriched threat intelligence entry',
      },
      lookup: {
        url: '/api/v1/lookup/:cveId',
        method: 'GET',
        paid: true,
        description: 'Lookup specific CVE by ID',
      },
      stats: {
        url: '/api/v1/stats',
        method: 'GET',
        paid: false,
        description: 'This endpoint — public API metrics',
      },
      health: {
        url: '/health',
        method: 'GET',
        paid: false,
        description: 'System health check',
      },
    },
  });
});

router.get('/feed', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const payments = getRecentPayments(limit);

  res.json({
    payments: payments.map((p) => ({
      id: p.id,
      from: p.from_address,
      amount: `${(parseInt(p.amount) / 1_000_000).toFixed(6)} USDC`,
      endpoint: p.endpoint,
      txHash: p.tx_hash || null,
      status: p.tx_hash ? 'SETTLED' : 'PENDING',
      createdAt: p.created_at,
      settledAt: p.settled_at || null,
      explorerUrl: p.tx_hash ? `https://explorer.arc.io/tx/${p.tx_hash}` : null,
    })),
  });
});

export default router;
