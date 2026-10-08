import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

export interface CoinBalanceInfo {
  coinType: string;
  packageId: string;
  symbol: string;
  name: string;
  decimals?: number;
  totalBalance: string;
}

export interface CoinTransferHistory {
  digest: string;
  timestamp: string;
  type: 'INBOUND' | 'OUTBOUND';
  counterpartyAddress: string;
  amount: string;
  coinType: string;
}

export interface HolderDeepDive {
  address: string;
  targetCoinBalance: string;
  otherCoinBalances: CoinBalanceInfo[];
  transferHistory: CoinTransferHistory[];
}

export interface HoldersReport {
  targetCoinType: string;
  coinMetadata?: {
    name: string;
    symbol: string;
    decimals: number;
  } | null;
  timestamp: string;
  totalHoldersFound: number;
  holders: HolderDeepDive[];
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * SuiClient instance using standard node infra endpoint with RPC fallback support.
 */
export const suiClient = new SuiClient({
  url: 'https://sui-mainnet.nodeinfra.com',
});

/**
 * Validates whether a string is a valid Sui Coin Type (including generic LP tokens).
 * Security check: Prevents injection attacks and invalid parameter formats.
 */
export function isValidCoinType(coinType: string): boolean {
  if (!coinType || typeof coinType !== 'string') return false;

  // Security check: Reject control characters, newlines, quotes, or injection symbols in raw input
  if (/[\r\n\0"'`;$]/.test(coinType)) return false;

  const trimmed = coinType.trim();
  if (trimmed !== coinType && (coinType.startsWith('\n') || coinType.endsWith('\n') || coinType.includes('\r'))) {
    return false;
  }

  // Sui Coin Type regex: 0x<hex>::<module>::<struct> or 0x<hex>::<module>::<struct><generic_types>
  const coinTypeRegex = /^0x[0-9a-fA-F]{1,64}::[a-zA-Z0-9_]+::[a-zA-Z0-9_<>,:\s]+$/;
  return coinTypeRegex.test(trimmed);
}

/**
 * Normalizes a Sui Coin Type to standard format.
 */
export function normalizeCoinType(coinType: string): string {
  if (!isValidCoinType(coinType)) {
    throw new Error(`Invalid Sui Coin Type format: ${coinType}`);
  }
  const trimmed = coinType.trim();
  const firstColon = trimmed.indexOf('::');
  const pkgAddress = trimmed.substring(0, firstColon).toLowerCase();
  const rest = trimmed.substring(firstColon);
  return `${pkgAddress}${rest}`;
}

/**
 * Executes an async function with exponential backoff retry for RPC rate limits and network errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 5;
  const baseDelay = options.baseDelayMs ?? 1000;
  const maxDelay = options.maxDelayMs ?? 10000;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      if (attempt > maxRetries) {
        throw error;
      }
      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 200;
      const delay = Math.min(exponentialDelay + jitter, maxDelay);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

const GRAPHQL_ENDPOINT = 'https://graphql.mainnet.sui.io/graphql';

/**
 * Executes a GraphQL query against the Sui GraphQL service with retry support.
 */
export async function executeGraphQL<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
  return withRetry(async () => {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'sui-coin-holder-tracker/1.0.0',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed with HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    if (json.errors && json.errors.length > 0) {
      const msg = json.errors.map((e: any) => e.message).join('; ');
      if (!json.data) {
        throw new Error(`GraphQL Query Error: ${msg}`);
      }
    }

    return json.data;
  });
}

/**
 * Extracts the package ID from a Sui Coin Type string.
 */
export function extractPackageId(coinType: string): string {
  return coinType.split('::')[0];
}

/**
 * Fetches coin metadata for a target coin type using SuiClient fallback and GraphQL.
 */
export async function fetchCoinMetadata(coinType: string) {
  const normalized = normalizeCoinType(coinType);

  // Try SuiClient JSON-RPC first
  try {
    const rpcMeta = await withRetry(() => suiClient.getCoinMetadata({ coinType: normalized }));
    if (rpcMeta) {
      return {
        name: rpcMeta.name,
        symbol: rpcMeta.symbol,
        decimals: rpcMeta.decimals,
      };
    }
  } catch (err) {
    // Fallback to GraphQL
  }

  const query = `
    query getCoinMetadata($coinType: String!) {
      coinMetadata(coinType: $coinType) {
        name
        symbol
        decimals
      }
    }
  `;
  try {
    const data = await executeGraphQL(query, { coinType: normalized });
    return data?.coinMetadata ?? null;
  } catch (err) {
    return null;
  }
}

/**
 * Fetches coin holders and their aggregated balance for a given coin type.
 */
export async function fetchCoinHolders(coinType: string, limit = 50): Promise<Array<{ address: string; balance: string }>> {
  const normalized = normalizeCoinType(coinType);
  const objectType = `0x2::coin::Coin<${normalized}>`;

  const query = `
    query getCoinObjects($type: String!, $limit: Int!) {
      objects(filter: { type: $type }, first: $limit) {
        nodes {
          owner {
            ... on AddressOwner {
              address {
                address
              }
            }
          }
          asMoveObject {
            contents {
              json
            }
          }
        }
      }
    }
  `;

  const data = await executeGraphQL(query, { type: objectType, limit });
  const nodes = data?.objects?.nodes || [];

  const balanceMap = new Map<string, bigint>();

  for (const node of nodes) {
    const ownerAddr = node?.owner?.address?.address;
    if (!ownerAddr) continue;

    const rawBalance = node?.asMoveObject?.contents?.json?.balance;
    if (rawBalance !== undefined && rawBalance !== null) {
      const current = balanceMap.get(ownerAddr) || 0n;
      balanceMap.set(ownerAddr, current + BigInt(rawBalance.toString()));
    }
  }

  const result: Array<{ address: string; balance: string }> = [];
  for (const [address, balance] of balanceMap.entries()) {
    result.push({ address, balance: balance.toString() });
  }

  // Sort descending by balance
  result.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : BigInt(b.balance) < BigInt(a.balance) ? -1 : 0));

  return result;
}

/**
 * Performs a deep-dive analysis on a holder address.
 */
export async function fetchWalletDeepDive(address: string, targetCoinType: string): Promise<HolderDeepDive> {
  const normalizedTarget = normalizeCoinType(targetCoinType);

  const query = `
    query getWalletDetails($addr: SuiAddress!) {
      address(address: $addr) {
        address
        balances {
          nodes {
            coinType { repr }
            totalBalance
          }
        }
        transactions(first: 20) {
          nodes {
            digest
            sender { address }
            effects {
              timestamp
              balanceChanges {
                nodes {
                  owner { address }
                  amount
                  coinType { repr }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await executeGraphQL(query, { addr: address });
  const addrData = data?.address;

  let targetCoinBalance = '0';
  const otherCoinBalances: CoinBalanceInfo[] = [];

  // Parse coin balances
  const balanceNodes = addrData?.balances?.nodes || [];
  for (const node of balanceNodes) {
    const rawCoinType = node?.coinType?.repr;
    if (!rawCoinType) continue;

    if (!isValidCoinType(rawCoinType)) continue;

    const normalizedCoin = normalizeCoinType(rawCoinType);
    const totalBal = node?.totalBalance || '0';

    if (normalizedCoin === normalizedTarget) {
      targetCoinBalance = totalBal;
    } else {
      const parts = normalizedCoin.split('::');
      const pkgId = parts[0];
      const symbol = parts[2] ? parts[2].split('<')[0] : 'UNKNOWN';
      const name = parts[1] ? `${parts[1]}::${parts[2] || symbol}` : symbol;

      otherCoinBalances.push({
        coinType: normalizedCoin,
        packageId: pkgId,
        symbol,
        name,
        totalBalance: totalBal,
      });
    }
  }

  // Parse transaction transfer history
  const transferHistory: CoinTransferHistory[] = [];
  const txNodes = addrData?.transactions?.nodes || [];

  for (const tx of txNodes) {
    const digest = tx?.digest;
    const sender = tx?.sender?.address;
    const timestamp = tx?.effects?.timestamp || new Date().toISOString();
    const balanceChanges = tx?.effects?.balanceChanges?.nodes || [];

    for (const change of balanceChanges) {
      const changeOwner = change?.owner?.address;
      if (changeOwner?.toLowerCase() !== address.toLowerCase()) continue;

      const rawAmountStr = change?.amount;
      if (!rawAmountStr) continue;

      const rawAmount = BigInt(rawAmountStr);
      if (rawAmount === 0n) continue;

      const rawCoin = change?.coinType?.repr;
      const coinType = rawCoin && isValidCoinType(rawCoin) ? normalizeCoinType(rawCoin) : rawCoin || 'UNKNOWN';

      let type: 'INBOUND' | 'OUTBOUND' = rawAmount > 0n ? 'INBOUND' : 'OUTBOUND';
      let counterpartyAddress = sender || '0x0';

      // Find counterparty from balance changes if available
      if (type === 'OUTBOUND') {
        const recipientChange = balanceChanges.find(
          (c: any) => c?.owner?.address && c.owner.address.toLowerCase() !== address.toLowerCase() && BigInt(c?.amount || '0') > 0n
        );
        if (recipientChange) {
          counterpartyAddress = recipientChange.owner.address;
        }
      } else {
        if (sender && sender.toLowerCase() !== address.toLowerCase()) {
          counterpartyAddress = sender;
        }
      }

      const absAmount = rawAmount < 0n ? (-rawAmount).toString() : rawAmount.toString();

      transferHistory.push({
        digest,
        timestamp,
        type,
        counterpartyAddress,
        amount: absAmount,
        coinType,
      });
    }
  }

  return {
    address,
    targetCoinBalance,
    otherCoinBalances,
    transferHistory,
  };
}

/**
 * Main tracker report generator.
 */
export async function generateReport(
  coinType: string,
  options: { maxHolders?: number } = {}
): Promise<HoldersReport> {
  if (!isValidCoinType(coinType)) {
    throw new Error(`Invalid Sui Coin Type: "${coinType}". Expected format "0x<pkg>::<module>::<name>"`);
  }

  const normalizedCoin = normalizeCoinType(coinType);
  const maxHolders = options.maxHolders ?? 50;

  const metadata = await fetchCoinMetadata(normalizedCoin);
  const holdersSummary = await fetchCoinHolders(normalizedCoin, maxHolders);

  const holdersDeepDive: HolderDeepDive[] = [];

  for (const h of holdersSummary) {
    const deepDive = await fetchWalletDeepDive(h.address, normalizedCoin);
    holdersDeepDive.push(deepDive);
  }

  return {
    targetCoinType: normalizedCoin,
    coinMetadata: metadata,
    timestamp: new Date().toISOString(),
    totalHoldersFound: holdersDeepDive.length,
    holders: holdersDeepDive,
  };
}
