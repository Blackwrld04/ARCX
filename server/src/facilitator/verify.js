import { verifyTypedData } from 'viem';
import { config } from '../config.js';
import { getUsdcDomain, TRANSFER_WITH_AUTH_TYPES, computeBoundNonce } from '../utils/arc.js';
import { logger } from '../utils/logger.js';

/**
 * Validates an EIP-3009 payment authorization before submitting on-chain.
 * This catches bad signatures, tampering, and expired nonces early, saving gas.
 *
 * @param {Object} payment - The payment object from the x402 header
 * @param {Object} [expectedRequest] - Optional request context for binding validation
 * @param {string} [expectedRequest.endpoint] - Target URL path
 * @param {string} [expectedRequest.method] - HTTP method
 *
 * Returns { valid: true } or { valid: false, reason: string }
 */
export async function verifyPayment(payment, expectedRequest = null) {
  const { from, to, value, validAfter, validBefore, nonce, signature, bindingSalt } = payment;

  // 1. Check the recipient matches our configured payTo address
  if (!to || to.toLowerCase() !== config.payToAddress.toLowerCase()) {
    return {
      valid: false,
      reason: `Payment recipient mismatch: expected ${config.payToAddress}, got ${to}`,
    };
  }

  // 2. Check the amount meets minimum required price
  if (BigInt(value) < BigInt(config.pricePerCall)) {
    return {
      valid: false,
      reason: `Insufficient payment: required ${config.pricePerCall}, got ${value}`,
    };
  }

  // 3. Check timestamp validity window
  const now = BigInt(Math.floor(Date.now() / 1000));

  if (BigInt(validAfter) > now) {
    return {
      valid: false,
      reason: `Payment not yet valid: validAfter ${validAfter} is in the future`,
    };
  }

  if (BigInt(validBefore) <= now) {
    return {
      valid: false,
      reason: `Payment expired: validBefore ${validBefore} has passed`,
    };
  }

  // 4. Validate cryptographic request binding if bindingSalt is provided (Correction 6)
  if (bindingSalt && expectedRequest?.endpoint && expectedRequest?.method) {
    const expectedNonce = computeBoundNonce(
      bindingSalt,
      expectedRequest.method,
      expectedRequest.endpoint
    );
    if (nonce.toLowerCase() !== expectedNonce.toLowerCase()) {
      logger.warn(
        { nonce, expectedNonce, endpoint: expectedRequest.endpoint, method: expectedRequest.method },
        'Request binding verification failed'
      );
      return {
        valid: false,
        reason: 'Payment nonce is not bound to this specific endpoint and HTTP method',
      };
    }
  }

  // 5. Verify the EIP-712 signature recovers to the claimed `from` address
  try {
    const message = {
      from,
      to,
      value: BigInt(value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce,
    };

    const domain = getUsdcDomain();

    const recoveredAddress = await verifyTypedData({
      address: from,
      domain,
      types: TRANSFER_WITH_AUTH_TYPES,
      primaryType: 'TransferWithAuthorization',
      message,
      signature,
    });

    if (!recoveredAddress) {
      return {
        valid: false,
        reason: 'Signature verification failed: recovered address does not match payer address',
      };
    }
  } catch (err) {
    logger.warn({ err: err.message, from }, 'Signature verification error');
    return {
      valid: false,
      reason: `Signature verification error: ${err.message}`,
    };
  }

  return { valid: true };
}
