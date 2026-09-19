import 'dotenv/config';
import { createWalletClient, http, toHex, keccak256, encodePacked } from 'viem';
import { arc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes } from 'crypto';

// --- Configuration ---
const AGENT_KEY = process.env.AGENT_PRIVATE_KEY;
const API_URL = process.env.API_URL || 'http://localhost:4402';
const NUM_QUERIES = parseInt(process.env.NUM_QUERIES || '1', 10);

if (!AGENT_KEY) {
  console.error('Missing AGENT_PRIVATE_KEY in .env');
  process.exit(1);
}

// --- Wallet setup using viem built-in Arc chain (Correction 5) ---
const account = privateKeyToAccount(AGENT_KEY);
const walletClient = createWalletClient({
  account,
  chain: arc,
  transport: http(),
});

console.log(`\n🤖 ArcX Agent`);
console.log(`   Wallet:  ${account.address}`);
console.log(`   Target:  ${API_URL}`);
console.log(`   Network: Arc Mainnet (Chain ${arc.id})`);
console.log(`   Queries: ${NUM_QUERIES}\n`);

// --- EIP-712 types for TransferWithAuthorization ---
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from',        type: 'address' },
    { name: 'to',          type: 'address' },
    { name: 'value',       type: 'uint256' },
    { name: 'validAfter',  type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce',       type: 'bytes32' },
  ],
};

/**
 * Computes cryptographically bound nonce for the request (Correction 6).
 */
function computeBoundNonce(saltHex, method, path) {
  const cleanPath = path.split('?')[0].replace(/\/$/, '') || '/';
  const cleanSalt = saltHex.startsWith('0x') ? saltHex.slice(0, 34) : `0x${saltHex}`.slice(0, 34);
  return keccak256(
    encodePacked(
      ['bytes16', 'string'],
      [cleanSalt, `${method.toUpperCase()}:${cleanPath}`]
    )
  );
}

/**
 * Execute a paid API call via x402 with idempotent retry support (Correction 7).
 */
async function queryEndpoint(path = '/api/v1/insight') {
  const url = `${API_URL}${path}`;

  // Step 1: Initial request — expect 402 challenge
  console.log(`→ GET ${url}`);
  const challenge = await fetch(url);

  if (challenge.status !== 402) {
    const body = await challenge.json().catch(() => ({}));
    console.log(`  Received status ${challenge.status}:`, body);
    return body;
  }

  // Step 2: Parse payment requirements from 402 response
  const terms = await challenge.json();
  const offer = terms.accepts?.[0];

  if (!offer) {
    throw new Error('402 response missing acceptable payment specifications');
  }

  const requiredAmount = offer.amount || offer.maxAmountRequired;
  console.log(`  ← 402 Payment Required`);
  console.log(`     Price:    ${(parseInt(requiredAmount) / 1_000_000).toFixed(6)} USDC`);
  console.log(`     Network:  ${offer.network}`);
  console.log(`     Pay to:   ${offer.payTo}`);
  console.log(`     Asset:    ${offer.asset}`);

  // Step 3: Build cryptographic request binding and sign authorization
  const salt = toHex(randomBytes(16));
  const nonce = computeBoundNonce(salt, 'GET', path);
  const now = BigInt(Math.floor(Date.now() / 1000));

  const message = {
    from:        account.address,
    to:          offer.payTo,
    value:       BigInt(requiredAmount),
    validAfter:  0n,
    validBefore: now + 3600n, // Valid for 1 hour
    nonce,
  };

  // Dynamic domain separator from challenge (Correction 3)
  const domain = {
    name:              offer.extra?.name || 'USDC',
    version:           offer.extra?.version || '2',
    chainId:           offer.extra?.chainId || arc.id,
    verifyingContract: offer.asset || '0x3600000000000000000000000000000000000000',
  };

  console.log(`  ✍️  Signing EIP-3009 authorization (nonce bound to GET ${path})...`);

  const signature = await walletClient.signTypedData({
    domain,
    types: EIP3009_TYPES,
    primaryType: 'TransferWithAuthorization',
    message,
  });

  // Step 4: Build payment payload
  const paymentPayload = {
    from:        account.address,
    to:          offer.payTo,
    value:       requiredAmount,
    validAfter:  '0',
    validBefore: (now + 3600n).toString(),
    nonce,
    bindingSalt: salt,
    signature,
  };

  const encoded = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

  // Step 5: Send with retry loop using cached payload (Correction 7: Idempotent retry)
  const MAX_ATTEMPTS = 3;
  let lastResult;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`  → Submitting payment (attempt ${attempt}/${MAX_ATTEMPTS})...`);

    try {
      const paid = await fetch(url, {
        headers: {
          'PAYMENT-SIGNATURE': encoded,
          'X-PAYMENT': encoded, // Backwards compatibility
        },
      });

      const responseReceipt = paid.headers.get('payment-response') || paid.headers.get('x-payment-response');
      const result = await paid.json().catch(() => ({}));

      if (paid.status === 200) {
        console.log(`  ← 200 OK — Payment settled!`);
        if (responseReceipt) {
          console.log(`     Receipt:  ${responseReceipt}`);
        }
        console.log(`     TX Hash:  ${result.payment?.txHash}`);
        console.log(`     Title:    ${result.insight?.title}`);
        console.log(`     Severity: ${result.insight?.severity}`);
        console.log(`     Explorer: ${result.payment?.explorerUrl}`);
        return result;
      }

      console.log(`  ← ${paid.status} Response:`, result);
      lastResult = result;

      // If client-side error (4xx) other than 409, do not retry
      if (paid.status >= 400 && paid.status < 500 && paid.status !== 409) {
        break;
      }
    } catch (networkErr) {
      console.warn(`  Warning: Network issue on attempt ${attempt}: ${networkErr.message}`);
      lastResult = { error: 'NETWORK_ERROR', message: networkErr.message };
    }

    if (attempt < MAX_ATTEMPTS) {
      const backoff = 1500 * attempt;
      console.log(`  Retrying in ${backoff}ms with same authorization nonce...`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  return lastResult;
}

// --- Main execution ---
async function main() {
  for (let i = 0; i < NUM_QUERIES; i++) {
    if (i > 0) console.log('---');
    console.log(`\n📡 Query ${i + 1}/${NUM_QUERIES}`);
    try {
      await queryEndpoint('/api/v1/insight');
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }
  }
  console.log('\n✅ Agent run complete\n');
}

main();
