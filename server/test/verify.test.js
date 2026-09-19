import assert from 'node:assert';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, toHex } from 'viem';
import { randomBytes } from 'node:crypto';
import { arc } from 'viem/chains';
import { config } from '../src/config.js';
import { verifyPayment } from '../src/facilitator/verify.js';
import { computeBoundNonce, getUsdcDomain, TRANSFER_WITH_AUTH_TYPES } from '../src/utils/arc.js';
import { initDatabase, getDb } from '../src/db/init.js';
import { recordPending, recordSettlement, findByNonce } from '../src/db/ledger.js';

console.log('🧪 Starting ArcX verification & test suite...\n');

// Initialize in-memory / test database
initDatabase();
const db = getDb();

// Test wallet setup
const testPrivateKey = generatePrivateKey();
const testAccount = privateKeyToAccount(testPrivateKey);
const testWallet = createWalletClient({
  account: testAccount,
  chain: arc,
  transport: http(),
});

async function runTests() {
  const domain = getUsdcDomain();
  console.log('✅ Dynamic EIP-712 domain:', domain);

  // --- Test 1: Valid EIP-3009 signature with request binding ---
  console.log('\nTest 1: Valid EIP-3009 signature with request binding');
  const salt = toHex(randomBytes(16));
  const endpoint = '/api/v1/insight';
  const method = 'GET';
  const boundNonce = computeBoundNonce(salt, method, endpoint);
  const now = BigInt(Math.floor(Date.now() / 1000));

  const validMessage = {
    from: testAccount.address,
    to: config.payToAddress,
    value: BigInt(config.pricePerCall),
    validAfter: 0n,
    validBefore: now + 3600n,
    nonce: boundNonce,
  };

  const validSignature = await testWallet.signTypedData({
    domain,
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: validMessage,
  });

  const validPayment = {
    from: testAccount.address,
    to: config.payToAddress,
    value: config.pricePerCall,
    validAfter: '0',
    validBefore: (now + 3600n).toString(),
    nonce: boundNonce,
    bindingSalt: salt,
    signature: validSignature,
  };

  const validRes = await verifyPayment(validPayment, { endpoint, method });
  assert.strictEqual(validRes.valid, true, `Expected valid payment, got: ${validRes.reason}`);
  console.log('  ✓ Valid payment with bound nonce verified successfully');

  // --- Test 2: Nonce binding mismatch (using signature on different endpoint) ---
  console.log('\nTest 2: Nonce binding mismatch (replay across endpoints)');
  const mismatchRes = await verifyPayment(validPayment, { endpoint: '/api/v1/lookup/CVE-2024-3094', method: 'GET' });
  assert.strictEqual(mismatchRes.valid, false);
  assert.match(mismatchRes.reason, /Payment nonce is not bound/);
  console.log('  ✓ Endpoint replay rejected by cryptographic binding');

  // --- Test 3: Insufficient payment value ---
  console.log('\nTest 3: Insufficient payment value');
  const lowPayment = { ...validPayment, value: '500' };
  const lowRes = await verifyPayment(lowPayment, { endpoint, method });
  assert.strictEqual(lowRes.valid, false);
  assert.match(lowRes.reason, /Insufficient payment/);
  console.log('  ✓ Insufficient amount rejected');

  // --- Test 4: Expired payment ---
  console.log('\nTest 4: Expired payment window');
  const expiredPayment = { ...validPayment, validBefore: (now - 10n).toString() };
  const expiredRes = await verifyPayment(expiredPayment, { endpoint, method });
  assert.strictEqual(expiredRes.valid, false);
  assert.match(expiredRes.reason, /Payment expired/);
  console.log('  ✓ Expired authorization rejected');

  // --- Test 5: Recipient mismatch ---
  console.log('\nTest 5: Recipient mismatch');
  const wrongRecipientPayment = { ...validPayment, to: testAccount.address };
  const wrongRecipRes = await verifyPayment(wrongRecipientPayment, { endpoint, method });
  assert.strictEqual(wrongRecipRes.valid, false);
  assert.match(wrongRecipRes.reason, /Payment recipient mismatch/);
  console.log('  ✓ Wrong recipient rejected');

  // --- Test 6: Ledger immutability triggers ---
  console.log('\nTest 6: SQLite trigger immutability enforcement');
  const testNonce = toHex(randomBytes(32));
  const paymentId = recordPending({
    nonce: testNonce,
    bindingSalt: salt,
    fromAddress: testAccount.address,
    toAddress: config.payToAddress,
    amount: '1000',
    endpoint: '/api/v1/insight',
    method: 'GET',
  });
  assert(paymentId > 0);

  // Updating settlement status should SUCCEED
  recordSettlement(paymentId, '0xabcdef123456', 12345, '21000', { test: true });
  const settled = findByNonce(testNonce);
  assert.strictEqual(settled.status, 'SETTLED');
  assert.strictEqual(settled.tx_hash, '0xabcdef123456');
  console.log('  ✓ Settlement update allowed by trigger');

  // Attempting to tamper with financial fields should FAIL
  assert.throws(() => {
    db.prepare('UPDATE payments SET amount = 999999 WHERE id = ?').run(paymentId);
  }, /Financial payment fields are immutable/);
  console.log('  ✓ Tampering with amount aborted by trigger');

  assert.throws(() => {
    db.prepare('UPDATE payments SET nonce = ? WHERE id = ?').run(toHex(randomBytes(32)), paymentId);
  }, /Financial payment fields are immutable/);
  console.log('  ✓ Tampering with nonce aborted by trigger');

  assert.throws(() => {
    db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);
  }, /Payment records cannot be deleted/);
  console.log('  ✓ Deletion prevented by trigger');

  console.log('\n🎉 ALL 6 TEST SUITES PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
