import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { fetchSuiCoins, saveCoinsReport, runFetchCoins } from '../src/fetch-coins.js';

describe('Blockberry SUI Coins Fetcher', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.BLOCKBERRY_API_KEY;

  beforeEach(() => {
    delete process.env.BLOCKBERRY_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.BLOCKBERRY_API_KEY = originalEnv;
    } else {
      delete process.env.BLOCKBERRY_API_KEY;
    }
    vi.restoreAllMocks();
  });

  it('fetches coins using default parameters and process.env.BLOCKBERRY_API_KEY', async () => {
    process.env.BLOCKBERRY_API_KEY = 'test-secret-key';
    const mockData = { content: [{ coinType: '0x2::sui::SUI' }] };

    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return {
        ok: true,
        json: async () => mockData,
      } as Response;
    });

    const result = await fetchSuiCoins();

    expect(result).toEqual(mockData);
    expect(capturedUrl).toContain('page=0');
    expect(capturedUrl).toContain('size=20');
    expect(capturedUrl).toContain('orderBy=DESC');
    expect(capturedUrl).toContain('sortBy=AGE');
    expect(capturedHeaders['x-api-key']).toBe('test-secret-key');
    expect(capturedHeaders['api-key']).toBe('test-secret-key');
  });

  it('allows overriding parameters and passing custom apiKey', async () => {
    const mockData = { content: [] };
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return {
        ok: true,
        json: async () => mockData,
      } as Response;
    });

    await fetchSuiCoins({
      page: 2,
      size: 50,
      orderBy: 'ASC',
      sortBy: 'MARKET_CAP',
      apiKey: 'custom-api-key',
    });

    expect(capturedUrl).toContain('page=2');
    expect(capturedUrl).toContain('size=50');
    expect(capturedUrl).toContain('orderBy=ASC');
    expect(capturedUrl).toContain('sortBy=MARKET_CAP');
    expect(capturedHeaders['x-api-key']).toBe('custom-api-key');
  });

  it('throws error when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    await expect(fetchSuiCoins()).rejects.toThrow('Blockberry API request failed with status 401: Unauthorized');
  });

  it('saveCoinsReport writes data to file and runFetchCoins calls fetch and save', async () => {
    const testFile = 'test_sui_coins_report.json';
    const mockData = { test: true };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    } as Response);

    try {
      await runFetchCoins({}, testFile);
      expect(fs.existsSync(testFile)).toBe(true);
      const content = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
      expect(content).toEqual(mockData);
    } finally {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });
});
