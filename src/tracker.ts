import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import * as fs from 'node:fs';

export interface CoinBalanceInfo {
  coinType: string;
  totalBalance: string;
}

export interface TransactionInfo {
  digest: string;
  timestamp: string | null;
  type: 'INBOUND' | 'OUTBOUND';
  counterparty: string;
  transferredAmount: string;
  coinType: string;
}

export interface HolderReport {
  address: string;
  targetCoinType: string;
  targetCoinBalance: string;
  otherBalances: CoinBalanceInfo[];
  transactions: TransactionInfo[];
}

export interface TrackerSummary {
  coinType: string;
  totalHolders: number;
  reportFile: string;
  holders: HolderReport[];
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  initialDelayMs = 500
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (attempt > maxRetries) {
        throw err;
      }
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function fetchWalletBalances(
  client: SuiClient,
  address: string,
  targetCoinType: string
): Promise<{ targetBalance: string; otherBalances: CoinBalanceInfo[] }> {
  const allBalances = await retryWithBackoff(() =>
    client.getAllBalances({ owner: address })
  );

  let targetBalance = '0';
  const otherBalances: CoinBalanceInfo[] = [];

  for (const b of allBalances) {
    if (b.coinType === targetCoinType) {
      targetBalance = b.totalBalance;
    } else {
      otherBalances.push({
        coinType: b.coinType,
        totalBalance: b.totalBalance,
      });
    }
  }

  return { targetBalance, otherBalances };
}

export async function fetchWalletHistory(
  client: SuiClient,
  address: string
): Promise<TransactionInfo[]> {
  const [sentBlocks, receivedBlocks] = await Promise.all([
    retryWithBackoff(() =>
      client.queryTransactionBlocks({
        filter: { FromAddress: address },
        options: { showBalanceChanges: true, showInput: true },
        limit: 20,
      })
    ).catch(() => ({ data: [] })),
    retryWithBackoff(() =>
      client.queryTransactionBlocks({
        filter: { ToAddress: address },
        options: { showBalanceChanges: true, showInput: true },
        limit: 20,
      })
    ).catch(() => ({ data: [] })),
  ]);

  const historyMap = new Map<string, TransactionInfo>();

  const processBlock = (tx: any, direction: 'OUTBOUND' | 'INBOUND') => {
    const digest = tx.digest;
    if (historyMap.has(digest)) return;

    const timestamp = tx.timestampMs
      ? new Date(Number(tx.timestampMs)).toISOString()
      : null;

    let counterparty = 'Unknown';
    if (direction === 'OUTBOUND') {
      // Find recipient from balance changes where balance increased
      if (tx.balanceChanges && Array.isArray(tx.balanceChanges)) {
        const recipientChange = tx.balanceChanges.find(
          (c: any) => c.owner?.AddressOwner && c.owner.AddressOwner !== address && BigInt(c.amount) > 0n
        );
        if (recipientChange) {
          counterparty = recipientChange.owner.AddressOwner;
        }
      }
    } else {
      counterparty = tx.transaction?.data?.sender || 'Unknown';
    }

    let transferredAmount = '0';
    let coinType = '0x2::sui::SUI';

    if (tx.balanceChanges && Array.isArray(tx.balanceChanges)) {
      for (const change of tx.balanceChanges) {
        if (
          (direction === 'OUTBOUND' && change.owner?.AddressOwner === address && BigInt(change.amount) < 0n) ||
          (direction === 'INBOUND' && change.owner?.AddressOwner === address && BigInt(change.amount) > 0n)
        ) {
          transferredAmount = (BigInt(change.amount) < 0n ? -BigInt(change.amount) : BigInt(change.amount)).toString();
          coinType = change.coinType;
          break;
        }
      }
    }

    historyMap.set(digest, {
      digest,
      timestamp,
      type: direction,
      counterparty,
      transferredAmount,
      coinType,
    });
  };

  sentBlocks.data.forEach((tx) => processBlock(tx, 'OUTBOUND'));
  receivedBlocks.data.forEach((tx) => processBlock(tx, 'INBOUND'));

  return Array.from(historyMap.values());
}

export async function fetchCoinHolders(
  client: SuiClient,
  coinType: string,
  sampleAddresses: string[] = []
): Promise<{ address: string; balance: string }[]> {
  const holderMap = new Map<string, bigint>();

  if (sampleAddresses.length > 0) {
    for (const address of sampleAddresses) {
      try {
        const bal = await retryWithBackoff(() =>
          client.getBalance({ owner: address, coinType })
        );
        if (BigInt(bal.totalBalance) > 0n) {
          holderMap.set(address, BigInt(bal.totalBalance));
        }
      } catch {
        // Skip on error
      }
    }
  } else {
    // Query recent coin transactions to discover active holders of coinType
    try {
      const txs = await retryWithBackoff(() =>
        client.queryTransactionBlocks({
          filter: { InputObject: coinType.split('::')[0] },
          options: { showBalanceChanges: true },
          limit: 50,
        })
      );

      for (const tx of txs.data) {
        if (tx.balanceChanges && Array.isArray(tx.balanceChanges)) {
          for (const change of tx.balanceChanges) {
            if (change.coinType === coinType && change.owner?.AddressOwner) {
              const addr = change.owner.AddressOwner;
              if (!holderMap.has(addr)) {
                try {
                  const bal = await retryWithBackoff(() =>
                    client.getBalance({ owner: addr, coinType })
                  );
                  if (BigInt(bal.totalBalance) > 0n) {
                    holderMap.set(addr, BigInt(bal.totalBalance));
                  }
                } catch {
                  // Ignore
                }
              }
            }
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  const holders: { address: string; balance: string }[] = [];
  holderMap.forEach((balance, address) => {
    holders.push({ address, balance: balance.toString() });
  });

  return holders;
}

export async function runTracker(coinType: string, rpcUrl?: string) {
  const endpoint = rpcUrl || getFullnodeUrl('mainnet');
  const client = new SuiClient({ url: endpoint });

  console.log(`⚡ Bolt Sui Tracker: Querying coin holders for ${coinType}...`);

  const holders = await fetchCoinHolders(client, coinType);
  const reports: HolderReport[] = [];

  for (const holder of holders) {
    const { targetBalance, otherBalances } = await fetchWalletBalances(client, holder.address, coinType);
    const transactions = await fetchWalletHistory(client, holder.address);

    reports.push({
      address: holder.address,
      targetCoinType: coinType,
      targetCoinBalance: targetBalance,
      otherBalances,
      transactions,
    });
  }

  const output: TrackerSummary = {
    coinType,
    totalHolders: reports.length,
    reportFile: 'holders_report.json',
    holders: reports,
  };

  fs.writeFileSync('holders_report.json', JSON.stringify(output, null, 2));

  console.log('\n================ SUI HOLDER TRACKER SUMMARY ================');
  console.log(`Coin Type: ${coinType}`);
  console.log(`Total Holders Discovered: ${reports.length}`);
  console.log('------------------------------------------------------------');
  reports.forEach((h, idx) => {
    console.log(`[${idx + 1}] Address: ${h.address}`);
    console.log(`    Target Balance: ${h.targetCoinBalance}`);
    console.log(`    Other Coins Held: ${h.otherBalances.length}`);
    console.log(`    Recent Transactions: ${h.transactions.length}`);
  });
  console.log('============================================================');
  console.log(`✅ Saved detailed report to holders_report.json\n`);

  return output;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const coinType = process.argv[2] || '0x2::sui::SUI';
  runTracker(coinType).catch((err) => {
    console.error('Error running holder tracker:', err);
    process.exit(1);
  });
}
