import { Router } from 'express';
import { getRandomInsight } from '../services/threatFeedService.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/v1/insight
 *
 * Returns a random enriched threat intelligence entry from curated threats
 * or actively exploited CISA KEV zero-day entries.
 * This endpoint is paywalled via x402Gate middleware.
 */
router.get('/', async (req, res) => {
  try {
    const entry = await getRandomInsight();

    res.json({
      insight: {
        id: entry.id,
        cve: entry.cve,
        title: entry.title,
        category: entry.category,
        severity: entry.severity,
        cvss: entry.cvss,
        mitre_attack: entry.mitre_attack,
        description: entry.description,
        remediation: entry.remediation,
        ioc_indicators: entry.ioc_indicators,
        is_actively_exploited: entry.is_actively_exploited || false,
        source: entry.source,
      },
      payment: {
        txHash: req.paymentTxHash,
        amount: `${(parseInt(req.paymentAmount) / 1_000_000).toFixed(6)} USDC`,
        from: req.paymentFrom,
        network: 'arc-mainnet',
        explorerUrl: `https://explorer.arc.io/tx/${req.paymentTxHash}`,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to sample threat insight');
    res.status(500).json({
      error: 'INSIGHT_FAILED',
      message: 'Failed to retrieve threat insight: ' + err.message,
    });
  }
});

export default router;
