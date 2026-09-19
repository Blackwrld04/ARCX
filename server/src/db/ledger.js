import { getDb } from './init.js';
import { logger } from '../utils/logger.js';

export function recordPending({ nonce, bindingSalt = '', fromAddress, toAddress, amount, endpoint, method = 'GET' }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO payments (nonce, binding_salt, from_address, to_address, amount, endpoint, method, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
  `);

  const result = stmt.run(
    nonce,
    bindingSalt,
    fromAddress.toLowerCase(),
    toAddress.toLowerCase(),
    amount.toString(),
    endpoint,
    method.toUpperCase()
  );
  logger.debug({ nonce, fromAddress, amount, endpoint, method }, 'Payment pending recorded');
  return result.lastInsertRowid;
}

export function recordSettlement(paymentId, txHash, blockNumber, gasUsed, responseData) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE payments
    SET status = 'SETTLED',
        tx_hash = ?,
        block_number = ?,
        gas_used = ?,
        response_data = ?,
        settled_at = datetime('now')
    WHERE id = ?
  `);

  stmt.run(
    txHash,
    blockNumber,
    gasUsed ? gasUsed.toString() : null,
    responseData ? JSON.stringify(responseData) : null,
    paymentId
  );
  logger.info({ paymentId, txHash }, 'Settlement recorded in ledger');
}

export function recordFailure(paymentId, errorMessage) {
  const db = getDb();
  db.prepare(`
    UPDATE payments
    SET status = 'FAILED',
        response_data = ?
    WHERE id = ?
  `).run(JSON.stringify({ error: errorMessage }), paymentId);
  logger.info({ paymentId, errorMessage }, 'Payment failure recorded in ledger');
}

export function resetPending(paymentId) {
  const db = getDb();
  db.prepare(`
    UPDATE payments
    SET status = 'PENDING'
    WHERE id = ?
  `).run(paymentId);
}

export function findByNonce(nonce) {
  const db = getDb();
  const payment = db.prepare(`
    SELECT *
    FROM payments
    WHERE nonce = ?
  `).get(nonce);

  return payment || null;
}

export function getStats() {
  const db = getDb();

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_payments,
      COALESCE(SUM(CASE WHEN status = 'SETTLED' THEN 1 ELSE 0 END), 0) as total_settled,
      COUNT(DISTINCT from_address) as unique_wallets,
      COALESCE(SUM(CASE WHEN status = 'SETTLED' THEN CAST(amount AS REAL) ELSE 0 END), 0) as total_amount_raw
    FROM payments
  `).get();

  const last24h = db.prepare(`
    SELECT COUNT(*) as count
    FROM payments
    WHERE status = 'SETTLED'
      AND settled_at >= datetime('now', '-1 day')
  `).get();

  const lastPayment = db.prepare(`
    SELECT tx_hash, settled_at, amount, from_address, endpoint
    FROM payments
    WHERE status = 'SETTLED' AND tx_hash IS NOT NULL
    ORDER BY settled_at DESC
    LIMIT 1
  `).get();

  return {
    totalPayments: totals.total_payments,
    totalSettled: totals.total_settled,
    uniqueWallets: totals.unique_wallets,
    totalRevenue: (totals.total_amount_raw / 1_000_000).toFixed(6),
    paymentsLast24h: last24h.count,
    lastPayment: lastPayment || null,
  };
}

export function getRecentPayments(limit = 20) {
  const db = getDb();
  return db.prepare(`
    SELECT
      id,
      nonce,
      binding_salt,
      from_address,
      to_address,
      amount,
      endpoint,
      method,
      status,
      tx_hash,
      block_number,
      gas_used,
      settled_at,
      created_at
    FROM payments
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}
