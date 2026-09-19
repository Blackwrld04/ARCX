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
  facilitatorPrivateKey: optional('FACILITATOR_PRIVATE_KEY', '0x0000000000000000000000000000000000000000000000000000000000000001'),
  payToAddress:          optional('PAYTO_ADDRESS', '0x8b415aE3956992b0cbC6C78c485A4d099F6331cE'),

  arcRpcUrl: optional('ARC_RPC_URL', 'https://rpc.mainnet.arc.io'),
  arcChainId: 5042,

  usdcAddress: '0x3600000000000000000000000000000000000000',
  usdcDecimals: 6,

  port: parseInt(optional('PORT', '4402'), 10),
  nodeEnv: optional('NODE_ENV', 'production'),

  pricePerCall: optional('PRICE_PER_CALL', '1000'),

  rateLimitWindowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '60000'), 10),
  rateLimitMax:      parseInt(optional('RATE_LIMIT_MAX', '60'), 10),

  dbPath: optional('DB_PATH', './data/arcx.db'),

  nvdApiKey:           optional('NVD_API_KEY', null),
  cisaKevUrl:          optional('CISA_KEV_URL', 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'),
  cisaKevRefreshHours: parseInt(optional('CISA_KEV_REFRESH_HOURS', '12'), 10),

  logLevel: optional('LOG_LEVEL', 'info'),
  adminKey: optional('ADMIN_KEY', 'arcx-admin-2026'),
};
