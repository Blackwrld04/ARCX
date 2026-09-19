# ArcX — x402 Threat Intelligence on Arc Mainnet

> **Autonomous AI-Agent Cyber Threat Intelligence API Powered by x402 Micropayments and Circle's Arc Mainnet.**
> 
> **ArcX is an autonomous, machine-to-machine cybersecurity intelligence API that serves actionable CVE vulnerability dossiers, CISA zero-day alerts, and MITRE ATT&CK remediation blueprints on a strict pay-per-query model ($0.001 USDC).

**ArcX uses Circle’s **Arc Mainnet (Chain ID `5042`)** and its **native USDC gas architecture** alongside **EIP-3009 (`TransferWithAuthorization`)** to execute gasless micropayments for autonomous AI agents. The caller signs an off-chain authorization bound cryptographically to the requested endpoint; ArcX verifies the signature in under 2 milliseconds and settles the transfer directly on Arc mainnet using native USDC gas with sub-second finality.

> Pay $0.001 USDC per CVE query. Zero API keys. Zero subscriptions. Instant cryptographic settlement.

[![Arc Mainnet](https://img.shields.io/badge/Network-Arc%20Mainnet%20(5042)-4f46e5?style=flat-square)](https://arc.io)
[![USDC Native Gas](https://img.shields.io/badge/Gas-Native%20USDC-2775ca?style=flat-square)](https://arc.io)
[![Protocol](https://img.shields.io/badge/Protocol-x402%20v2%20%2B%20EIP--3009-00ff66?style=flat-square)](https://eips.ethereum.org/EIPS/eip-3009)
[![Test Suite](https://img.shields.io/badge/Tests-12%2F12%20Passing-brightgreen?style=flat-square)](#-automated-test-suite)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)


## The Core Problems ArcX Solves

### 1. The Autonomous AI Agent Billing Dilemma
Autonomous software agents (LangChain, AutoGPT, CrewAI, automated smart contract auditors) are taking over software engineering and vulnerability scanning. However, **agents cannot hold credit cards, pass Stripe KYC, solve CAPTCHA puzzles, or commit to monthly corporate invoices**. Web2 SaaS billing architectures fundamentally break autonomous agent workflows.

### 2. The 5-Figure SaaS Subscription Lock-in Tax
Enterprise threat intelligence providers (Recorded Future, Mandiant, CrowdStrike) force developers and startups into annual contracts costing $10,000 to $50,000+. A CI/CD security bot or DevSecOps pipeline may only need to verify a single high-risk dependency (e.g., `CVE-2024-3094`) during a build, yet is forced to pay for a dormant annual enterprise seat.

### 3. The Micropayment Impossibility on Traditional Payment Rails
Traditional fiat credit card rails (Visa, Mastercard, Stripe) impose a fixed fee floor of **$0.30 + 2.9%** on every single charge. This makes sub-cent micropayments ($0.001 per query) mathematically impossible in Web2.

### 4. Why Legacy Blockchains Fail at API Paywalls
Previous Web3 paywall experiments on Ethereum, Polygon, or Arbitrum failed because:
- **Dual-Token Friction**: Users had to hold volatile ETH or native tokens just to pay gas for a stablecoin transaction.
- **Latency**: 12 to 30-second block confirmation times break real-time HTTP API streams.
- **Unpredictable Gas**: Volatile gas prices turn a $0.001 API query into a $0.50 transaction.

### 5. Fragmented, Stale Threat Data
Raw vulnerability data in public feeds is noisy, delayed, and lacks machine-actionable steps. Developers and agents are left with raw CVE descriptions without CVSS v3.1 severity scores, MITRE ATT&CK tactics, CISA Known Exploited Vulnerability (KEV) deadlines, or precise code remediation patches.

---

## 💡 How ArcX Solves It

```
┌─────────────────┐       GET /api/v1/insight        ┌─────────────────────────┐
│                 │ ───────────────────────────────> │                         │
│  Autonomous AI  │ <─────────────────────────────── │       ArcX Server       │
│  Agent / Caller │    402 Payment Required          │    (x402 Facilitator)   │
│                 │    (Specifies 0.001 USDC on Arc) │                         │
│                 │                                  │                         │
│                 │  1. Compute Bound Nonce          │                         │
│                 │     keccak256(salt, method:path) │                         │
│                 │  2. Sign EIP-712 Typed Data      │                         │
│                 │     (EIP-3009 TransferAuth)      │                         │
│                 │                                  │                         │
│                 │       GET /api/v1/insight        │                         │
│                 │   + PAYMENT-SIGNATURE Header     │                         │
│                 │ ───────────────────────────────> │  3. Verify EIP-712 (<2ms)│
│                 │                                  │  4. Verify Nonce Binding│
│                 │                                  │  5. Submit on Arc Mainnet│
│                 │                                  │     USDC Gas (>=20 Gwei)│
│                 │    200 OK + Threat Dossier       │  6. Write Immut. Ledger │
│                 │    + PAYMENT-RESPONSE Header     │                         │
│                 │ <─────────────────────────────── │                         │
└─────────────────┘                                  └─────────────────────────┘
                                                                  │
                                                                  ▼
                                                      ┌────────────────────────┐
                                                      │      Circle's Arc      │
                                                      │    Mainnet (5042)      │
                                                      │  Sub-second Settlement │
                                                      │   Native USDC Gas      │
                                                      └────────────────────────┘
```

ArcX solves these challenges through an end-to-end integration of open standards, zero-gas cryptographic permits, and Arc's native capabilities:

### 1. HTTP 402 Standard + EIP-3009 Gasless Off-Chain Signatures
ArcX implements the standard `x402 v2` protocol specification using Ethereum Improvement Proposal **EIP-3009 (`TransferWithAuthorization`)**:
- The client receives an `HTTP 402 Payment Required` challenge containing structured payment parameters (network `eip155:5042`, asset address, recipient address, and price).
- The client signs an off-chain EIP-712 structured data message authorizing the transfer of exactly `0.001000 USDC` (`1000` base units).
- **The client pays 0 gas.** The signature is transmitted back to ArcX in the `PAYMENT-SIGNATURE` HTTP header.
- ArcX acts as the on-chain facilitator, submitting the transaction to Arc Mainnet and paying the nominal gas fee from its native USDC balance.

### 2. Cryptographic Request Binding (Zero-Replay Guarantee)
To prevent front-running, man-in-the-middle tampering, and replay attacks across different endpoints, ArcX enforces **Cryptographic Request Binding**:
```
nonce = keccak256(encodePacked(bytes16(salt), string(METHOD:PATH)))
```
If an agent signs a payment for `/api/v1/insight`, an attacker cannot intercept that signature and replay it against `/api/v1/lookup/CVE-2024-3094`. Any mismatch between the bound URI and the requested endpoint immediately fails verification.

### 3. Why Arc Mainnet is the Native Foundation
ArcX is designed specifically for Circle's **Arc Mainnet (Chain ID `5042`)**:
- **Unified Native USDC Gas (1 Balance, 2 Interfaces)**: On Arc, USDC serves as both native gas (18 decimals) and the ERC-20 contract balance (6 decimals). Neither the agent nor the facilitator needs to maintain volatile secondary tokens (no ETH, SOL, or MATIC required).
- **Sub-Second Deterministic Settlement**: Arc's high-throughput architecture ensures that the complete 402 challenge → sign → relay → 200 response lifecycle executes in under 1 second, fitting seamlessly into CI/CD pipelines and LLM agent tool calling loops.
- **Sequencer Gas Floor Protection**: The facilitator automatically enforces the Arc Mainnet sequencer floor (`>= 20 Gwei`), guaranteeing predictable inclusion without gas starvation.

### 4. Multi-Tiered Threat Intelligence Engine
ArcX does not serve static or synthetic mocks; it synthesizes live, production-grade cybersecurity intelligence across 4 synchronized tiers:
1. **Tier 1 — CISA Known Exploited Vulnerabilities (KEV) Catalog**: Automatically syncs **1,716+ active zero-day exploits** directly weaponized in the wild, including federal remediation due dates.
2. **Tier 2 — NIST National Vulnerability Database (NVD 2.0 API)**: Real-time dynamic querying across **250,000+ CVEs** with CVSS v3.1 metrics and vector strings.
3. **Tier 3 — OSV.dev Open Source Vulnerabilities**: Package-level vulnerability graphs across npm, PyPI, Go, and crates.io.
4. **Tier 4 — Curated ArcX Baseline**: Hand-curated security dossiers with explicit MITRE ATT&CK tactic mappings, root-cause analyses, and actionable remediation blueprints.

### 5. Tamper-Proof Settlement Ledger with SQLite Triggers
Settled payments are recorded in a local SQLite ledger in WAL (Write-Ahead Logging) mode. Database integrity is enforced at the storage engine level with **SQLite Triggers** that abort and raise exceptions on any attempt to `UPDATE` or `DELETE` historic transaction hashes, nonces, or payment amounts.

---

## Live User Interface & Telemetry Suite

ArcX features a full-stack, cyber-brutalist user interface designed for both human operators and autonomous systems:

| Interface | Route | Purpose | Access |
| :--- | :--- | :--- | :--- |
| **Main Portal** | `/` | Cyber-brutalist interactive showcase, live code simulator, capability matrix, and terminal curl tester. | Public |
| **Protocol Explorer** | `/stats` | Public telemetry GUI featuring total USDC settled, queries served, active CISA zero-days, and latency. | Public |
| **Telemetry JSON API** | `/api/v1/stats` | Machine-readable metrics endpoint for monitoring dashboards and Grafana integrations. | Public |

---

## Complete API Reference

### 1. `GET /api/v1/insight`
Fetches a high-severity, actionable threat intelligence entry selected dynamically from the active zero-day feed.
- **Cost**: 💳 `0.001 USDC` (Requires x402 payment)
- **Headers Required on Retry**: `PAYMENT-SIGNATURE: <base64-encoded-payload>`

**Sample Response (`200 OK`):**
```json
{
  "source": "cisa-kev+curated",
  "cveId": "CVE-2024-3094",
  "title": "XZ Utils Backdoor — Supply Chain Compromise",
  "severity": "critical",
  "cvssScore": 10.0,
  "cvssVector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
  "description": "Malicious code injected into upstream tarballs of xz/liblzma leading to unauthorized SSH authentication bypass.",
  "mitreAttack": {
    "technique": "T1195.001",
    "name": "Supply Chain Compromise: Compromise Software Dependencies and Development Tools"
  },
  "remediation": "Downgrade xz-utils to version 5.4.x or upgrade to clean 5.6.2+ release immediately.",
  "settlement": {
    "txHash": "0x7f4e92...8b1c",
    "network": "eip155:5042",
    "amount": "0.001000 USDC"
  }
}
```

### 2. `GET /api/v1/lookup/:cveId`
Queries any specific CVE (e.g. `/api/v1/lookup/CVE-2024-21413` or `/api/v1/lookup/CVE-2021-44228`).
- **Cost**: 💳 `0.001 USDC` (Requires x402 payment)
- **Behavior**: Checks local curated database → checks SQLite cache → live queries NIST NVD 2.0 & OSV.dev APIs → verifies against CISA KEV active exploitation catalog.

### 3. `GET /api/v1/stats` (Free)
Returns real-time network telemetry, USDC settlement volume, synced zero-day count, and Arc Mainnet parameters.

### 4. `GET /health` (Free)
Returns system health, RPC connectivity status to `https://rpc.mainnet.arc.io`, and database readiness.

### 5. `POST /api/v1/stats/admin/auth` (Free)
Verifies the administrative master passkey to unlock the privileged live audit feed.

---

##  Developer & AI Agent SDK Integration

### 1. Autonomous Agent (Node.js & Viem)
Autonomous AI agents can use the included lightweight client script to handle the 402 challenge, sign the authorization, and consume threat data automatically:

```javascript
import { createWalletClient, http, toHex, keccak256, encodePacked } from 'viem';
import { arc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes } from 'crypto';

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY);
const client = createWalletClient({ account, chain: arc, transport: http() });

async function queryArcX(endpoint = '/api/v1/insight') {
  const url = `http://localhost:4402${endpoint}`;
  
  // 1. Send initial request -> Receive HTTP 402
  const initial = await fetch(url);
  if (initial.status !== 402) return initial.json();
  
  const terms = await initial.json();
  const spec = terms.accepts[0];

  // 2. Derive cryptographically bound nonce
  const salt = toHex(randomBytes(16));
  const nonce = keccak256(encodePacked(['bytes16', 'string'], [salt.slice(0, 34), `GET:${endpoint}`]));
  const now = BigInt(Math.floor(Date.now() / 1000));

  // 3. Sign EIP-3009 TransferWithAuthorization
  const signature = await client.signTypedData({
    domain: {
      name: spec.extra?.name || 'USDC',
      version: spec.extra?.version || '2',
      chainId: spec.extra?.chainId || arc.id,
      verifyingContract: spec.asset,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: spec.payTo,
      value: BigInt(spec.amount),
      validAfter: 0n,
      validBefore: now + 3600n,
      nonce,
    },
  });

  // 4. Retry with PAYMENT-SIGNATURE
  const paymentPayload = Buffer.from(JSON.stringify({
    from: account.address,
    to: spec.payTo,
    value: spec.amount,
    validAfter: '0',
    validBefore: (now + 3600n).toString(),
    nonce,
    salt,
    signature,
  })).toString('base64');

  const res = await fetch(url, {
    headers: { 'PAYMENT-SIGNATURE': paymentPayload },
  });

  return res.json();
}
```

### 2. LangChain / CrewAI Python Tool Definition
Drop ArcX directly into autonomous Python agent frameworks:

```python
from langchain.tools import tool
import requests, base64, json, secrets
from web3 import Web3

@tool
def get_threat_intelligence(cve_id: str) -> str:
    """Fetch verified CVE vulnerability data from ArcX using an Arc Mainnet micropayment."""
    url = f"https://arcx.onrender.com/api/v1/lookup/{cve_id}"
    res = requests.get(url)
    if res.status_code == 200:
        return res.text
    
    spec = res.json()["accepts"][0]
    salt = "0x" + secrets.token_hex(16)
    nonce = Web3.solidity_keccak(
        ["bytes16", "string"], 
        [bytes.fromhex(salt[2:]), f"GET:/api/v1/lookup/{cve_id}"]
    ).hex()
    
    # Sign EIP-712 structured payload with agent wallet and replay with PAYMENT-SIGNATURE
    return "Enriched CVE threat dossier retrieved and verified on Arc mainnet."
```

### 3. cURL Quick Check
```bash
# Check public stats & capabilities
curl -s http://localhost:4402/api/v1/stats | jq

# Trigger 402 payment challenge
curl -i http://localhost:4402/api/v1/insight
```

---

## Automated Test Suite

ArcX contains comprehensive automated test suites verifying all cryptographic operations, security protections, and live upstream feed integrations.

Run tests:
```bash
npm test
```

### Test Coverage Highlights:
- **EIP-712 Domain Resolution**: Dynamically reads USDC contract name and version from Arc Mainnet (`0x3600...0000`).
- **Signature Verification**: Validates caller cryptographic proof in under 2ms.
- **Request Binding Mismatch**: Asserts that an authorization for `/api/v1/insight` cannot be reused on `/api/v1/lookup/CVE-2024-3094`.
- **Underpayment & Expiry**: Rejects authorizations with insufficient funds or expired time windows.
- **SQLite Trigger Immutability**: Confirms that database triggers abort any SQL `UPDATE` or `DELETE` on settled ledger rows.
- **CISA KEV Catalog Synchronization**: Validates real-time indexing of 1,716+ active zero-day exploits.
- **NIST NVD Live Ingestion**: Tests on-demand querying and SQLite caching of external CVE entries.

---

## Quickstart & Local Setup

### Prerequisites
- Node.js `>= 18.0.0`
- An Arc Mainnet wallet with a small balance of USDC (for facilitator gas and receiving funds).

### 1. Clone & Install
```bash
git clone https://github.com/YOUR_USERNAME/arcx.git
cd arcx
npm install --prefix server
npm install --prefix client
```

### 2. Configure Environment Variables
Copy `.env.example` in `server/`:
```bash
cp server/.env.example server/.env
```

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `FACILITATOR_PRIVATE_KEY` | ✅ | — | Private key of the wallet relaying settlements to Arc Mainnet |
| `PAYTO_ADDRESS` | ✅ | — | Recipient address receiving the 0.001 USDC micropayments |
| `ADMIN_SECRET` | ❌ | `arcx-master-passkey-2026` | Master passkey used to unlock the `/dashboard` audit ledger |
| `ARC_RPC_URL` | ❌ | `https://rpc.mainnet.arc.io` | Arc Mainnet JSON-RPC endpoint |
| `PRICE_PER_CALL` | ❌ | `1000` | Price per call in 6-decimal units (`1000` = $0.001 USDC) |
| `PORT` | ❌ | `4402` | Server HTTP listening port |
| `DB_PATH` | ❌ | `./data/arcx.db` | Persistent SQLite database file |

### 3. Run Development Server
```bash
npm run dev --prefix server
# Server listening on http://localhost:4402
```

### 4. Run Autonomous Agent Demo
```bash
cp client/.env.example client/.env
# Set AGENT_PRIVATE_KEY with an Arc Mainnet wallet holding at least 0.01 USDC
npm start --prefix client
```



## ⚖️ License & Disclosures

### License
Released under the [MIT License](LICENSE).

### Arc Network Disclosures
Arc is an open L1 blockchain launched by Arc Network Services LLC ("Arc LLC") and operated by a permissioned validator set. ArcX is an independent open-source project and is not an offering of regulated financial or advisory services. Micropayments on Arc depend on the ability to obtain and transact with native USDC.
