# Sentinel Security Journal

## 2026-10-08 - Sui Coin Type Validation & Generic Types Injection Prevention
**Vulnerability:** Sui Coin Types can represent generic structures like LP tokens (e.g. `0x...::swap::LSP<COIN1, COIN2>`). Overly restrictive regexes broke parsing, while overly broad regexes risk command injection or RPC parameter injection if control characters (`\n`, `;`, `"`, `'`, `$`) are passed.
**Learning:** Raw CLI inputs for blockchain object types must strip/block control and injection characters before parameter construction.
**Prevention:** Enforce control-character filters (`/[\r\n\0"'`;$]/`) prior to regex matching and parameter normalization.
