import * as fs from 'node:fs';

export interface FetchCoinsOptions {
  page?: string | number;
  size?: string | number;
  orderBy?: string;
  sortBy?: string;
  apiKey?: string;
  baseUrl?: string;
}

export const DEFAULT_BLOCKBERRY_URL = 'https://api.blockberry.one/sui/v1/coins';

export async function fetchSuiCoins(options: FetchCoinsOptions = {}) {
  const page = String(options.page ?? '0');
  const size = String(options.size ?? '20');
  const orderBy = options.orderBy ?? 'DESC';
  const sortBy = options.sortBy ?? 'AGE';
  const apiKey = options.apiKey ?? process.env.BLOCKBERRY_API_KEY;
  const baseUrl = options.baseUrl ?? DEFAULT_BLOCKBERRY_URL;

  const url = new URL(baseUrl);
  url.searchParams.set('page', page);
  url.searchParams.set('size', size);
  url.searchParams.set('orderBy', orderBy);
  url.searchParams.set('sortBy', sortBy);

  const headers: Record<string, string> = {
    accept: 'application/json',
  };

  if (apiKey) {
    headers['x-api-key'] = apiKey;
    headers['api-key'] = apiKey;
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Blockberry API request failed with status ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

export function saveCoinsReport(data: unknown, filePath = 'sui_coins_report.json'): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export async function runFetchCoins(options: FetchCoinsOptions = {}, outputFile = 'sui_coins_report.json') {
  console.log('⚡ Fetching SUI coins from Blockberry API...');
  const data = await fetchSuiCoins(options);
  saveCoinsReport(data, outputFile);
  console.log(`✅ Saved coin report to ${outputFile}`);
  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchCoins().catch((err) => {
    console.error('Error fetching SUI coins:', err);
    process.exit(1);
  });
}
