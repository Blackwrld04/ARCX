# Arc Smart Contracts (Arc Foundry)

Smart contract infrastructure deployed on **Arc Mainnet** using **Arc Foundry** (`arc-forge` and `arc-cast`).

## Network Parameters

| Parameter | Value |
| :--- | :--- |
| **Network Name** | Arc Mainnet |
| **Chain ID** | `5042` |
| **RPC Endpoint** | `https://rpc.mainnet.arc.io` |
| **Native Gas Currency** | USDC (18 decimals) |
| **Block Explorer** | [explorer.arc.io](https://explorer.arc.io) |

---

## Deployed Mainnet Contracts

### 1. Facilitator Contract
- **Deployer (Facilitator)**: `0x461cd48D95993242bB04774cc68042795586BbAd`
- **Contract Address**: [`0xA4e01C4d7088110cCD289fAf4d39Ae4BC3010726`](https://explorer.arc.io/address/0xA4e01C4d7088110cCD289fAf4d39Ae4BC3010726)
- **Deployment Transaction**: [`0x8f9a86a7b8e56e71b659f08bdcb9878fc7b823fdc89fe63fbcc4f7d569f24e53`](https://explorer.arc.io/tx/0x8f9a86a7b8e56e71b659f08bdcb9878fc7b823fdc89fe63fbcc4f7d569f24e53)
- **Interaction (`increment`)**: [`0x63dc88dcd58f03bea6b7bde40a809dde0136dc27dab1f03b4f4048d09b8218ae`](https://explorer.arc.io/tx/0x63dc88dcd58f03bea6b7bde40a809dde0136dc27dab1f03b4f4048d09b8218ae)
- **Status**: Live on Mainnet (State: `number() = 1`)

### 2. Agent Contract
- **Deployer (Agent)**: `0x21d87e9D85B1F3CF8D5C355B798A76e7f36F5F26`
- **Contract Address**: [`0xBd64b40865a6a148d43221F91fB791d08E559CAf`](https://explorer.arc.io/address/0xBd64b40865a6a148d43221F91fB791d08E559CAf)
- **Deployment Transaction**: [`0x98a0ddb16c65776c8bebf97310196bb26c46aa942b4351daa4363b699b942390`](https://explorer.arc.io/tx/0x98a0ddb16c65776c8bebf97310196bb26c46aa942b4351daa4363b699b942390)
- **Interaction (`increment`)**: [`0xb14928c1bbf9a8b788815d1c32116735b9a51c2b50fe9626a1dfc3795131a9f3`](https://explorer.arc.io/tx/0xb14928c1bbf9a8b788815d1c32116735b9a51c2b50fe9626a1dfc3795131a9f3)
- **Status**: Live on Mainnet (State: `number() = 1`)

---

## Verification

Due to Cloudflare WAF on `explorer.arc.io`, manual verification can be performed on the block explorer:
1. Visit [Arc Explorer Contract Verification](https://explorer.arc.io/contract-verification)
2. Enter the contract address (`0xA4e01C4d7088110cCD289fAf4d39Ae4BC3010726` or `0xBd64b40865a6a148d43221F91fB791d08E559CAf`)
3. Select **Solidity (Standard-Json-Input)** or **Solidity (Single file)**
4. Upload `standard-json-input.json` or paste `src/Counter.sol` (Compiler `0.8.20`, Shanghai EVM, No Optimization).

---

## On-Chain CLI Commands

```bash
# Read counter value on Mainnet
arc-cast call 0xA4e01C4d7088110cCD289fAf4d39Ae4BC3010726 "number()(uint256)" --rpc-url https://rpc.mainnet.arc.io

# Increment counter on Mainnet
arc-cast send 0xA4e01C4d7088110cCD289fAf4d39Ae4BC3010726 "increment()" \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $FACILITATOR_PRIVATE_KEY
```
