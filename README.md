# 🛡️ Sentinel: Sui Coin Holder Tracker

A robust, security-focused TypeScript command-line application that tracks token holders, balance breakdowns, and transaction transfer histories on the Sui blockchain.

---

## 🌟 Features

- **Sui Coin Holder Discovery:** Aggregates current wallet balances and holder addresses for any specified Sui Coin Type.
- **Wallet Deep-Dive Analysis:**
  - **Target Coin Balance:** Queries current balance of the tracked coin.
  - **All Other Coin Balances:** Retrieves all other tokens held by each wallet (symbols, package IDs, amounts).
  - **Transaction Transfer History:** Analyzes incoming and outgoing token transfers, extracting Transaction Digest (Tx ID), timestamp (ISO string), transfer direction (`INBOUND` / `OUTBOUND`), counterparty address, and amounts.
- **Security & Reliability:**
  - **Input Validation & Sanitization:** Strict regex and control-character filters prevent command/parameter injection and path traversal attacks.
  - **Exponential Backoff Retry Logic:** Automatic retries with jitter for RPC rate limits (HTTP 429 / 503 errors).
  - **Fail-Secure Error Handling:** Suppresses internal stack traces in output.
- **Formatted Report Output:** Writes full nested analytical results to `holders_report.json` and renders summary metrics in the terminal.

---

## 🚀 Quick Start

### 1. Installation

Ensure Node.js (v18+) and `pnpm` are installed:

```bash
pnpm install
```

### 2. Execution

Run the tracker for any Sui Coin Type via command-line argument:

```bash
# Track CHILLBULL coin
pnpm start "0x8130994ef5299d244dbf18cf1e134c3aea2ab517ee37c351a40cd9ed33bc59ca::chillbull::CHILLBULL"

# Track standard SUI coin
pnpm start "0x2::sui::SUI"
```

If no coin type argument is provided, the CLI defaults to tracking `CHILLBULL`.

---

## 📜 Available Commands

- **Run CLI Application:** `pnpm start [COIN_TYPE]`
- **Run Unit Tests:** `pnpm test` (executes Vitest test suite)
- **Check Types & Lint:** `pnpm lint`
- **Build TypeScript Output:** `pnpm build`

---

## 📊 Report Format (`holders_report.json`)

The output file `holders_report.json` contains:

```json
{
  "targetCoinType": "0x8130994ef5299d244dbf18cf1e134c3aea2ab517ee37c351a40cd9ed33bc59ca::chillbull::CHILLBULL",
  "coinMetadata": {
    "name": "CHILL BULL",
    "symbol": "CHILLBULL",
    "decimals": 6
  },
  "timestamp": "2026-10-08T00:37:23.031Z",
  "totalHoldersFound": 20,
  "holders": [
    {
      "address": "0x...",
      "targetCoinBalance": "1000",
      "otherCoinBalances": [
        {
          "coinType": "0x2::sui::SUI",
          "packageId": "0x0000000000000000000000000000000000000000000000000000000000000002",
          "symbol": "SUI",
          "name": "sui::SUI",
          "totalBalance": "1000000000"
        }
      ],
      "transferHistory": [
        {
          "digest": "B11Rsztoo3BbYCHmdmxTVUvGibTRSVhr1AUVUpjRj1KJ",
          "timestamp": "2024-12-16T11:35:15.530Z",
          "type": "OUTBOUND",
          "counterpartyAddress": "0x...",
          "amount": "10000000000",
          "coinType": "0x2::sui::SUI"
        }
      ]
    }
  ]
}
```

---

## 🔒 Security Policy & Principles

1. **Input Validation:** Enforces strict regex validation for Sui Coin Types `0x<package>::<module>::<struct>` and generic types while rejecting control characters, quotes, and newlines.
2. **Resilience:** Implements exponential backoff to handle rate limits cleanly without crashing.
3. **No Hardcoded Secrets:** Zero embedded credentials or sensitive keys.
