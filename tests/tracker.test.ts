import { describe, it, expect, vi } from 'vitest';
import {
  isValidCoinType,
  normalizeCoinType,
  withRetry,
  extractPackageId,
  fetchCoinMetadata,
} from '../src/tracker.js';

describe('Sui Coin Holder Tracker - Security & Core Tests', () => {
  describe('isValidCoinType', () => {
    it('validates standard Sui Coin Types correctly', () => {
      expect(isValidCoinType('0x2::sui::SUI')).toBe(true);
      expect(
        isValidCoinType(
          '0x8130994ef5299d244dbf18cf1e134c3aea2ab517ee37c351a40cd9ed33bc59ca::chillbull::CHILLBULL'
        )
      ).toBe(true);
    });

    it('validates generic LP Coin Types correctly', () => {
      expect(
        isValidCoinType(
          '0xb24b6789e088b876afabca733bed2299fbc9e2d6369be4d1acfa17d8145454d9::swap::LSP<0x2::sui::SUI, 0xc06::coin::COIN>'
        )
      ).toBe(true);
    });

    it('rejects invalid or unsafe inputs', () => {
      expect(isValidCoinType('')).toBe(false);
      expect(isValidCoinType('invalid_coin_type')).toBe(false);
      expect(isValidCoinType('0x2::sui')).toBe(false); // missing struct
      expect(isValidCoinType('0xGGGG::sui::SUI')).toBe(false); // invalid hex address
      expect(isValidCoinType('0x2::sui::SUI; DROP TABLE users;')).toBe(false); // SQL injection attempt
      expect(isValidCoinType('0x2::sui::SUI\n')).toBe(false); // newline injection
      expect(isValidCoinType('0x2::sui::"SUI"')).toBe(false); // double quote injection
      expect(isValidCoinType('../../../etc/passwd')).toBe(false); // path traversal attempt
    });
  });

  describe('normalizeCoinType', () => {
    it('lowercases package address and preserves module/struct case', () => {
      const normalized = normalizeCoinType(
        '0x8130994EF5299D244DBF18CF1E134C3AEA2AB517EE37C351A40CD9ED33BC59CA::chillbull::CHILLBULL'
      );
      expect(normalized).toBe(
        '0x8130994ef5299d244dbf18cf1e134c3aea2ab517ee37c351a40cd9ed33bc59ca::chillbull::CHILLBULL'
      );
    });

    it('throws descriptive error on invalid coin type', () => {
      expect(() => normalizeCoinType('bad-type')).toThrowError(
        'Invalid Sui Coin Type format: bad-type'
      );
    });
  });

  describe('extractPackageId', () => {
    it('extracts package address correctly', () => {
      expect(
        extractPackageId(
          '0x8130994ef5299d244dbf18cf1e134c3aea2ab517ee37c351a40cd9ed33bc59ca::chillbull::CHILLBULL'
        )
      ).toBe(
        '0x8130994ef5299d244dbf18cf1e134c3aea2ab517ee37c351a40cd9ed33bc59ca'
      );
    });
  });

  describe('fetchCoinMetadata', () => {
    it('fetches real coin metadata for 0x2::sui::SUI', async () => {
      const meta = await fetchCoinMetadata('0x2::sui::SUI');
      expect(meta).not.toBeNull();
      expect(meta?.symbol).toBe('SUI');
      expect(meta?.decimals).toBe(9);
    });
  });

  describe('withRetry (Exponential Backoff)', () => {
    it('returns result on first attempt if fn succeeds', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn, { baseDelayMs: 1 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and eventually succeeds', async () => {
      let callCount = 0;
      const fn = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('RPC Rate Limit 429');
        }
        return 'retry_success';
      });

      const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });
      expect(result).toBe('retry_success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws error after exceeding max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Persistent Failure'));
      await expect(
        withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 })
      ).rejects.toThrow('Persistent Failure');
      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });
});
