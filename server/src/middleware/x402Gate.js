import { config } from '../config.js';
import { verifyPayment } from '../facilitator/verify.js';
import { settleOnChain } from '../facilitator/settle.js';
import { recordPending, recordSettlement, recordFailure, resetPending, findByNonce } from '../db/ledger.js';
import { getUsdcDomain } from '../utils/arc.js';
import { logger } from '../utils/logger.js';

/**
 * ArcX x402 payment gate middleware.
 *
 * Implements the x402 protocol specification:
 * - If no payment header present: responds 402 with PAYMENT-REQUIRED challenge and payment requirements.
 * - If PAYMENT-SIGNATURE (or X-PAYMENT) header present: verifies signature, settles on Arc mainnet, and passes through.
 * - If payment nonce was already settled: returns cached response immediately (idempotent, no double-settlement).
 */
export function x402Gate(options = {}) {
  const {
    price = config.pricePerCall,
    description = 'Cybersecurity threat intelligence query',
  } = options;

  return async (req, res, next) => {
    // Check both standard v2 header and legacy x-payment header
    const paymentHeader = req.headers['payment-signature'] || req.headers['x-payment'];

    const domain = getUsdcDomain();

    // Helper to build 402 challenge terms
    const buildChallenge = (errorMessage = null) => {
      const requirements = {
        x402Version: 2,
        accepts: [
          {
            scheme: 'exact',
            network: 'eip155:5042',
            amount: price.toString(),
            maxAmountRequired: price.toString(),
            resource: req.originalUrl,
            description,
            mimeType: 'application/json',
            payTo: config.payToAddress,
            asset: config.usdcAddress,
            extra: {
              name: domain.name,
              version: domain.version,
              chainId: domain.chainId,
              verifyingContract: domain.verifyingContract,
            },
          },
        ],
      };

      if (errorMessage) {
        requirements.error = 'PAYMENT_INVALID';
        requirements.message = errorMessage;
      }

      return requirements;
    };

    // --- 1. No payment header: Return 402 challenge ---
    if (!paymentHeader) {
      const challenge = buildChallenge();
      const challengeJson = JSON.stringify(challenge);
      res.set('PAYMENT-REQUIRED', Buffer.from(challengeJson).toString('base64'));
      res.set('X-PAYMENT-REQUIRED', Buffer.from(challengeJson).toString('base64'));
      return res.status(402).json(challenge);
    }

    // --- 2. Decode payment payload ---
    let payment;
    try {
      // Can be base64-encoded JSON or direct JSON string
      const raw = paymentHeader.trim().startsWith('{')
        ? paymentHeader.trim()
        : Buffer.from(paymentHeader, 'base64').toString('utf-8');
      payment = JSON.parse(raw);
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to decode payment signature header');
      return res.status(400).json({
        error: 'INVALID_PAYMENT',
        message: 'Payment header must be base64-encoded JSON or raw JSON string',
      });
    }

    const { from, to, value, validAfter, validBefore, nonce, signature, bindingSalt } = payment;

    // Validate required fields
    if (!from || !to || !value || !nonce || !signature) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Payment must include: from, to, value, validAfter, validBefore, nonce, signature',
      });
    }

    // --- 3. Idempotency & status check: has this nonce already been processed? ---
    const existing = findByNonce(nonce);
    let paymentId;

    if (existing) {
      if (existing.status === 'SETTLED' && existing.tx_hash) {
        logger.info({ nonce, txHash: existing.tx_hash }, 'Idempotent replay — returning cached response');
        res.set('PAYMENT-RESPONSE', JSON.stringify({
          txHash: existing.tx_hash,
          network: 'eip155:5042',
          settled: true,
          replay: true,
        }));
        res.set('X-PAYMENT-RESPONSE', JSON.stringify({
          txHash: existing.tx_hash,
          network: 'arc-mainnet',
          success: true,
          replay: true,
        }));

        if (existing.response_data) {
          try {
            return res.status(200).json(JSON.parse(existing.response_data));
          } catch {
            // Fall through if json parse fails
          }
        }

        req.paymentTxHash = existing.tx_hash;
        req.paymentFrom = existing.from_address;
        req.paymentAmount = existing.amount;
        return next();
      }

      if (existing.status === 'FAILED') {
        logger.info({ nonce, paymentId: existing.id }, 'Retrying previously failed settlement with same nonce');
        paymentId = existing.id;
        resetPending(paymentId);
      } else {
        // Status is PENDING
        logger.warn({ nonce }, 'Duplicate nonce — payment currently being processed');
        return res.status(409).json({
          error: 'DUPLICATE_NONCE',
          message: 'This payment authorization nonce is currently being processed',
        });
      }
    }

    // --- 4. Pre-chain verification (Signature, timestamps, amounts, request binding) ---
    const verification = await verifyPayment(payment, {
      endpoint: req.originalUrl,
      method: req.method,
    });

    if (!verification.valid) {
      logger.warn({ nonce, reason: verification.reason }, 'Payment authorization verification failed');
      const challenge = buildChallenge(verification.reason);
      return res.status(402).json(challenge);
    }

    // --- 5. Record pending payment in ledger if not already existing ---
    if (!paymentId) {
      try {
        paymentId = recordPending({
          nonce,
          bindingSalt: bindingSalt || '',
          fromAddress: from,
          toAddress: to,
          amount: value,
          endpoint: req.originalUrl,
          method: req.method,
        });
      } catch (err) {
        if (err.message?.includes('UNIQUE constraint')) {
          logger.warn({ nonce }, 'Duplicate nonce constraint violation');
          return res.status(409).json({
            error: 'DUPLICATE_NONCE',
            message: 'This payment authorization nonce is already being processed or settled',
          });
        }
        throw err;
      }
    }

    // --- 6. On-chain settlement on Arc mainnet ---
    let settlement;
    try {
      settlement = await settleOnChain(payment);
    } catch (err) {
      logger.error({ err: err.message, nonce, paymentId }, 'On-chain settlement failed');
      recordFailure(paymentId, err.message);
      return res.status(502).json({
        error: 'SETTLEMENT_FAILED',
        message: `On-chain settlement failed: ${err.message}. Your funds were not transferred.`,
      });
    }

    // --- 7. Attach payment details and intercept response to cache ---
    req.paymentId = paymentId;
    req.paymentTxHash = settlement.txHash;
    req.paymentBlockNumber = settlement.blockNumber;
    req.paymentGasUsed = settlement.gasUsed;
    req.paymentFrom = from;
    req.paymentAmount = value;

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      try {
        recordSettlement(
          paymentId,
          settlement.txHash,
          settlement.blockNumber,
          settlement.gasUsed,
          body
        );
      } catch (err) {
        logger.error({ err: err.message, paymentId }, 'Failed to update settlement record in database');
      }

      // Standard v2 and legacy receipt headers
      const receipt = {
        txHash: settlement.txHash,
        network: 'eip155:5042',
        settled: true,
        blockNumber: settlement.blockNumber,
      };

      res.set('PAYMENT-RESPONSE', JSON.stringify(receipt));
      res.set('X-PAYMENT-RESPONSE', JSON.stringify({
        ...receipt,
        network: 'arc-mainnet',
        success: true,
      }));

      return originalJson(body);
    };

    logger.info(
      { nonce, txHash: settlement.txHash, from, amount: value },
      'Payment settled successfully — access granted'
    );

    next();
  };
}
