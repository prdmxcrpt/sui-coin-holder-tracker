# AGENTS.md - Sui Chain Holder & Wallet Tracker

## Tech Stack
- Runtime: Node.js (TypeScript) oder Python (3.11+)
- Sui Client Library: @mysten/sui (TypeScript) oder pysui (Python)
- Output: JSON-Export + CLI/Web-Anzeige

## Core Objective
Fetch the top token holders for a given Coin Package Type on the Sui blockchain via RPC.
For each holder wallet:
1. Fetch current Coin Balance of the specified Coin Type.
2. Fetch ALL other coin balances held by this address.
3. Query incoming and outgoing transaction history (digest, timestamp, target address, transfer amounts) for these assets.