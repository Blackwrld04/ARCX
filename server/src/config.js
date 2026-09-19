import 'dotenv/config';

function required(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`[FATAL] Missing required environment variable: ${name}`);
    console.error(`       Copy .env.example to .env and fill in your values.`);
    process.exit(1);
  }
  return val;
}

function optional(name, fallback) {
  return process.env[name] || fallback;
}

export const config = {
  // Wallets (defaults to testing facilitator key if not provided)
  facilitatorPrivateKey: optional('FACILITATOR_PRIVATE_KEY', '0x37cb716ba0af8594a72133c7fc98155c36372ab0ec9292dde661c937520b0c23'),
  payToAddress:          optional('PAYTO_ADDRESS', '0x8b415aE3956992b0cbC6C78c485A4d099F6331cE'),

  // Arc network
  arcRpcUrl: optional('ARC_RPC_URL', 'https://rpc.mainnet.arc.io'),
  arcChainId: 5042,

  // Arc network & USDC architecture (Correction 4):
  // Arc features "one balance, two interfaces" — a single unified USDC balance per account.
  // Native transfers/gas use 18 decimals; ERC-20 contract calls use 6 decimals.
  // The ERC-20 contract at 0x3600000000000000000000000000000000000000 provides
  // EIP-3009 transferWithAuthorization capabilities for x402 payment rails.
  usdcAddress: '0x3600000000000000000000000000000000000000',
  usdcDecimals: 6,

  // Server
  port: parseInt(optional('PORT', '4402'), 10),
  nodeEnv: optional('NODE_ENV', 'production'),

  // Pricing (in 6-decimal USDC units)
  // 1000 = $0.001
  pricePerCall: optional('PRICE_PER_CALL', '1000'),

  // Rate limiting
  rateLimitWindowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '60000'), 10),
  rateLimitMax:      parseInt(optional('RATE_LIMIT_MAX', '60'), 10),

  // Database
  dbPath: optional('DB_PATH', './data/arcx.db'),

  // External threat intelligence feeds
  nvdApiKey:           optional('NVD_API_KEY', null),
  cisaKevUrl:          optional('CISA_KEV_URL', 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'),
  cisaKevRefreshHours: parseInt(optional('CISA_KEV_REFRESH_HOURS', '12'), 10),

  // Logging
  logLevel: optional('LOG_LEVEL', 'info'),
};
