# Sui Chain Holder & Wallet Tracker

Command line application to track token holders and wallet deep-dive histories on the Sui blockchain.

## Features
- Fetches wallet balances for specified Sui coin types.
- Discovers all other coin balances held by holder wallets using `suix_getAllBalances`.
- Queries incoming and outgoing transaction history with amounts, timestamps, and counterparties.
- Automatic retry and rate-limiting using exponential backoff to handle RPC rate limits.
- Exports comprehensive report to `holders_report.json`.

## Quickstart

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tracker CLI for target Sui coin
npx tsx src/tracker.ts "0x8130994ef5299d244dbf18cf1e134c3aea2ab517ee37c351a40cd9ed33bc59ca::chillbull::CHILLBULL"
```
