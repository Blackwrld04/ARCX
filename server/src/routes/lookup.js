import { Router } from 'express';
import { lookupCve } from '../services/threatFeedService.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/v1/lookup/:cveId
 *
 * Returns enriched data for a specific CVE from curated threats, local cache,
 * or live external feeds (NIST NVD 2.0, CISA KEV, OSV.dev).
 * This endpoint is paywalled via x402Gate middleware.
 */
router.get('/:cveId', async (req, res) => {
  const cveId = req.params.cveId.toUpperCase().trim();

  // Validate CVE format
  if (!/^CVE-\d{4}-\d{4,}$/.test(cveId)) {
    return res.status(400).json({
      error: 'INVALID_CVE_FORMAT',
      message: 'CVE ID must be in the format CVE-YYYY-NNNNN (e.g., CVE-2024-3094)',
    });
  }

  try {
    const entry = await lookupCve(cveId);
    if (!entry) {
      return res.status(404).json({
        error: 'CVE_NOT_FOUND',
        message: `${cveId} could not be located in ArcX curated intelligence, NIST NVD, or CISA KEV feeds.`,
      });
    }

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
        cisa_kev: entry.cisa_kev || null,
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
    logger.error({ cve: cveId, err: err.message }, 'Error resolving CVE threat dossier');
    res.status(500).json({
      error: 'LOOKUP_FAILED',
      message: `Failed to resolve ${cveId} threat intelligence: ${err.message}`,
    });
  }
});

export default router;
