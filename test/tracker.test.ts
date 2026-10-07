import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff, fetchWalletBalances, CoinBalanceInfo } from '../src/tracker.js';

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
});
