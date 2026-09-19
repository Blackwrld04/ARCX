# ArcX

**x402-powered cybersecurity threat intelligence API on Arc mainnet.**

Pay per query in USDC. No signup. No API key. No subscription. Just pay and get real-time intelligence.

## What is this?

ArcX is an x402-native threat intelligence API. Autonomous AI agents and security tools pay a fraction of a cent ($0.001 USDC) per query for enriched CVE vulnerability data, MITRE ATT&CK mappings, and actionable hardening recommendations — all settled instantly on [Arc](https://arc.io), Circle's stablecoin-native L1.

### Why x402 on Arc?

- **No accounts, no API keys** — the cryptographic payment signature *is* the authorization.
- **Sub-cent pricing** — $0.001 per call, impossible with traditional card rails.
- **Sub-second settlement** — Arc's instant finality makes the 402 → sign → pay → 200 loop nearly instantaneous.
- **Unified USDC balance** — Arc uses USDC for gas (18 decimals) and ERC-20 contract calls (6 decimals) from a single shared account balance.
- **Cryptographic request binding** — Payment authorizations are mathematically bound to the exact HTTP method and endpoint.
- **Autonomous agents** — AI agents can pay-per-request with zero human intervention.

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/arcx.git
cd arcx/server
cp .env.example .env
# Edit .env with your facilitator wallet private key and receiving address
npm install
```

### 2. Start the server

```bash
npm start
```

### 3. Check the free endpoints

```bash
# Public API metrics and capabilities
curl http://localhost:4402/api/v1/stats

# System health and RPC connectivity
curl http://localhost:4402/health
```

### 4. Try a paid endpoint (receive a 402 challenge)

```bash
curl -i http://localhost:4402/api/v1/insight
# → HTTP/1.1 402 Payment Required + PAYMENT-REQUIRED header
```

### 5. Run the autonomous agent

```bash
cd ../client
cp .env.example .env
# Set AGENT_PRIVATE_KEY with an Arc mainnet wallet holding USDC
npm install
npm start
```

The agent will:
1. Hit `/api/v1/insight`.
2. Receive the `402 Payment Required` challenge with payment specifications.
3. Cryptographically bind and sign an EIP-3009 `TransferWithAuthorization` using viem.
4. Retry with the `PAYMENT-SIGNATURE` header (and automatic idempotent retry if interrupted).
5. Settle on Arc mainnet and receive enriched CVE intelligence + on-chain transaction receipt.

## API Endpoints

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/v1/insight` | GET | 💳 $0.001 USDC | Random enriched threat intelligence entry |
| `/api/v1/lookup/:cveId` | GET | 💳 $0.001 USDC | Query specific CVE vulnerability by ID |
| `/api/v1/stats` | GET | 🟢 Free | Public API metrics, volume, and specifications |
| `/health` | GET | 🟢 Free | System health, RPC connectivity, database status |
| `/dashboard` | GET | 🟢 Free | Real-time administrative monitoring dashboard |

## Architecture

```
AI Agent → GET /api/v1/insight → 402 Payment Required (PAYMENT-REQUIRED header)
         → Compute bound nonce (salt + method + path)
         → Sign EIP-3009 TransferWithAuthorization (off-chain)
         → Retry with PAYMENT-SIGNATURE header
         → ArcX verifies EIP-712 signature & request binding
         → Submits transferWithAuthorization on Arc mainnet (≥20 Gwei gas floor)
         → 200 OK + enriched CVE threat intel + PAYMENT-RESPONSE header
```

- **Self-hosted facilitator** — Direct viem integration with Arc mainnet (`https://rpc.mainnet.arc.io`, chain ID `5042`).
- **Dynamic contract domain** — Resolves USDC name (`"USDC"`) and version (`"2"`) dynamically at startup from contract `0x3600000000000000000000000000000000000000`.
- **Versioned migrations** — Database schema versioned with numbered `.sql` migrations and exclusive locking.
- **Immutable payment ledger** — SQLite in WAL mode with SQLite triggers enforcing immutability of nonces and payment amounts.
- **Idempotency** — Repeated queries with the same authorization nonce return cached data without re-billing.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FACILITATOR_PRIVATE_KEY` | ✅ | — | Private key for the wallet submitting settlement txs |
| `PAYTO_ADDRESS` | ✅ | — | Address that receives USDC payments |
| `ARC_RPC_URL` | ❌ | `https://rpc.mainnet.arc.io` | Arc mainnet RPC endpoint |
| `PORT` | ❌ | `4402` | Server HTTP port |
| `PRICE_PER_CALL` | ❌ | `1000` | Price in USDC 6-decimal units (1000 = $0.001) |
| `DB_PATH` | ❌ | `./data/arcx.db` | SQLite database file location |
| `LOG_LEVEL` | ❌ | `info` | Pino logging level |

## Tech Stack

- **Server:** Node.js, Express, Better-SQLite3
- **Blockchain:** viem (`viem/chains`), Circle Arc Mainnet (Chain 5042)
- **Protocol:** x402 v2 protocol implementation with EIP-3009 authorization
- **Security:** Helmet, CORS, per-wallet rate limiting, cryptographically bound nonces

## On-Chain Verification

Inspect settled transactions on the [Arc Explorer](https://explorer.arc.io).

## License

MIT
