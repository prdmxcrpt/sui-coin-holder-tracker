import { describe, it, expect, vi } from 'vitest';
import {
  retryWithBackoff,
  fetchWalletBalances,
  fetchWalletHistory,
  fetchCoinHolders,
} from '../src/tracker.js';

describe('Sui Holder Tracker Utilities', () => {
  it('retryWithBackoff retries failed calls and succeeds', async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error('RPC Error');
      return 'success';
    });

    const result = await retryWithBackoff(fn, 3, 10);
    expect(result).toBe('success');
    expect(calls).toBe(3);
  });

  it('fetchWalletBalances separates target coin balance from other coin balances', async () => {
    const mockClient: any = {
      getAllBalances: vi.fn().mockResolvedValue([
        { coinType: '0x2::sui::SUI', totalBalance: '1000000000' },
        { coinType: '0x8130994ef5299d244dbf18cf1e134c3aea2ab517ee37c351a40cd9ed33bc59ca::chillbull::CHILLBULL', totalBalance: '500' },
      ]),
    };

    const targetType = '0x8130994ef5299d244dbf18cf1e134c3aea2ab517ee37c351a40cd9ed33bc59ca::chillbull::CHILLBULL';
    const result = await fetchWalletBalances(mockClient, '0x123', targetType);

    expect(result.targetBalance).toBe('500');
    expect(result.otherBalances.length).toBe(1);
    expect(result.otherBalances[0].coinType).toBe('0x2::sui::SUI');
  });

  it('fetchWalletHistory correctly parses inbound and outbound transactions', async () => {
    const address = '0xuser123';
    const recipient = '0xrecipient456';
    const sender = '0xsender789';

    const mockClient: any = {
      queryTransactionBlocks: vi.fn().mockImplementation(async (params: any) => {
        if (params.filter?.FromAddress === address) {
          return {
            data: [
              {
                digest: 'digest_outbound_1',
                timestampMs: '1700000000000',
                balanceChanges: [
                  { owner: { AddressOwner: address }, amount: '-1000', coinType: '0x2::sui::SUI' },
                  { owner: { AddressOwner: recipient }, amount: '1000', coinType: '0x2::sui::SUI' },
                ],
              },
            ],
          };
        }
        if (params.filter?.ToAddress === address) {
          return {
            data: [
              {
                digest: 'digest_inbound_1',
                timestampMs: '1700000001000',
                transaction: {
                  data: {
                    sender: sender,
                  },
                },
                balanceChanges: [
                  { owner: { AddressOwner: address }, amount: '500', coinType: '0x2::sui::SUI' },
                ],
              },
            ],
          };
        }
        return { data: [] };
      }),
    };

    const history = await fetchWalletHistory(mockClient, address);
    expect(history.length).toBe(2);

    const outbound = history.find((h) => h.type === 'OUTBOUND');
    expect(outbound).toBeDefined();
    expect(outbound?.digest).toBe('digest_outbound_1');
    expect(outbound?.counterparty).toBe(recipient);
    expect(outbound?.transferredAmount).toBe('1000');
    expect(outbound?.coinType).toBe('0x2::sui::SUI');

    const inbound = history.find((h) => h.type === 'INBOUND');
    expect(inbound).toBeDefined();
    expect(inbound?.digest).toBe('digest_inbound_1');
    expect(inbound?.counterparty).toBe(sender);
    expect(inbound?.transferredAmount).toBe('500');
    expect(inbound?.coinType).toBe('0x2::sui::SUI');
  });

  it('fetchCoinHolders fetches balances for sample addresses', async () => {
    const coinType = '0x8130994ef5299d244dbf18cf1e134c3aea2ab517ee37c351a40cd9ed33bc59ca::chillbull::CHILLBULL';
    const mockClient: any = {
      getBalance: vi.fn().mockImplementation(async ({ owner }: { owner: string }) => {
        if (owner === '0xholder1') return { totalBalance: '200' };
        if (owner === '0xholder2') return { totalBalance: '500' };
        return { totalBalance: '0' };
      }),
    };

    const holders = await fetchCoinHolders(mockClient, coinType, ['0xholder1', '0xholder2', '0xzero']);
    expect(holders.length).toBe(2);
    expect(holders[0]).toEqual({ address: '0xholder2', balance: '500' });
    expect(holders[1]).toEqual({ address: '0xholder1', balance: '200' });
  });

  it('fetchCoinHolders discovers holders from transaction blocks when sampleAddresses is empty', async () => {
    const coinType = '0xpackage::coin::COIN';
    const mockClient: any = {
      queryTransactionBlocks: vi.fn().mockResolvedValue({
        data: [
          {
            balanceChanges: [
              { owner: { AddressOwner: '0xdiscovered1' }, coinType, amount: '100' },
            ],
          },
        ],
      }),
      getBalance: vi.fn().mockResolvedValue({ totalBalance: '100' }),
    };

    const holders = await fetchCoinHolders(mockClient, coinType);
    expect(holders.length).toBe(1);
    expect(holders[0]).toEqual({ address: '0xdiscovered1', balance: '100' });
  });
});
