# Bolt's Journal - Critical Learnings

## 2026-10-07 - Sui Client RPC Pagination & Rate Limits
**Learning:** Sui RPC nodes heavily rate-limit batch requests and `suix_getAllBalances` or `queryTransactionBlocks`. Exponential backoff with jitter and single-concurrency or throttled batching is required to avoid 429 Too Many Requests.
**Action:** Wrap all `SuiClient` calls in an exponential backoff retry mechanism with delay intervals.
