import 'server-only';

import type { TopbarPriceTicker } from '@/features/topbar/types';
import { incrementCacheCounter, rememberJson } from '@/lib/cache/json-cache';

const symbols = ['BTC', 'ETH', 'SOL', 'BNB'] as const;
const binanceSymbols = symbols.map((symbol) => `${symbol}USDT`);
const coinGeckoIds = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
} satisfies Record<(typeof symbols)[number], string>;
const fallbackPrices = symbols.map((symbol) => ({ symbol, price: null, change: null }));
const providerState = globalThis as typeof globalThis & {
  endorsecoinTopbarPriceFetches?: number[];
  endorsecoinTopbarPriceInFlight?: Promise<TopbarPriceTicker[]>;
  endorsecoinTopbarLastGoodPrices?: TopbarPriceTicker[];
};

const requestTimeoutMs = 4_000;
const maxRequestsPerDay = Number(process.env.TOPBAR_PRICE_DAILY_LIMIT || 480);
const cacheSeconds = Number(process.env.TOPBAR_PRICE_CACHE_SECONDS || 120);

const binanceFallbackBaseUrls = [
  ...(
    process.env.TOPBAR_BINANCE_FALLBACK_BASE_URLS ||
    'https://api.binance.com,https://data-api.binance.vision'
  )
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),
].filter((url, index, list) => list.indexOf(url) === index);

export function getCachedTopbarPrices() {
  return rememberJson('topbar:prices:v1', { ttlSeconds: cacheSeconds }, getSafeTopbarPrices);
}

async function getSafeTopbarPrices(): Promise<TopbarPriceTicker[]> {
  try {
    const prices = await dedupeFetch('topbar-market-prices', fetchMarketPrices);
    if (hasPriceData(prices)) providerState.endorsecoinTopbarLastGoodPrices = prices;
    return hasPriceData(prices) ? prices : getLastGoodPrices();
  } catch {
    return getLastGoodPrices();
  }
}

async function fetchMarketPrices(): Promise<TopbarPriceTicker[]> {
  const binancePrices = await fetchBinancePrices();
  if (hasPriceData(binancePrices)) return binancePrices;

  const coinGeckoPrices = await fetchCoinGeckoPrices();
  return hasPriceData(coinGeckoPrices) ? coinGeckoPrices : fallbackPrices;
}

async function fetchBinancePrices(): Promise<TopbarPriceTicker[]> {
  if (!(await canUsePriceProvider())) return fallbackPrices;

  for (const baseUrl of binanceFallbackBaseUrls) {
    const prices = await fetchBinancePricesFromBaseUrl(baseUrl);
    if (hasPriceData(prices)) return prices;
  }

  return fallbackPrices;
}

async function fetchBinancePricesFromBaseUrl(baseUrl: string): Promise<TopbarPriceTicker[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/api/v3/ticker/24hr?symbols=${encodeURIComponent(
        JSON.stringify(binanceSymbols),
      )}`,
      {
        headers: { accept: 'application/json' },
        next: { revalidate: cacheSeconds },
        signal: controller.signal,
      },
    );

    if (!response.ok) return fallbackPrices;

    const payload = await response.json();
    if (!Array.isArray(payload)) return fallbackPrices;

    const tickers = new Map<string, TopbarPriceTicker>(
      payload.map((item) => {
        const symbol = String(item.symbol || '').replace(
          /USDT$/,
          '',
        ) as TopbarPriceTicker['symbol'];
        return [
          symbol,
          {
            symbol,
            price: readNumber(item.lastPrice),
            change: readNumber(item.priceChangePercent),
          },
        ];
      }),
    );

    return symbols.map((symbol) => tickers.get(symbol) || { symbol, price: null, change: null });
  } catch {
    return fallbackPrices;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCoinGeckoPrices(): Promise<TopbarPriceTicker[]> {
  if (!(await canUsePriceProvider())) return fallbackPrices;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(coinGeckoIds).join(',')}&vs_currencies=usd&include_24hr_change=true`,
      {
        headers: { accept: 'application/json' },
        next: { revalidate: cacheSeconds },
        signal: controller.signal,
      },
    );

    if (!response.ok) return fallbackPrices;

    const payload = await response.json();
    return symbols.map((symbol) => {
      const item = payload[coinGeckoIds[symbol]];
      return {
        symbol,
        price: readNumber(item?.usd),
        change: readNumber(item?.usd_24h_change),
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function dedupeFetch(_key: string, fetcher: () => Promise<TopbarPriceTicker[]>) {
  if (providerState.endorsecoinTopbarPriceInFlight) {
    return providerState.endorsecoinTopbarPriceInFlight;
  }

  providerState.endorsecoinTopbarPriceInFlight = fetcher().finally(() => {
    providerState.endorsecoinTopbarPriceInFlight = undefined;
  });

  return providerState.endorsecoinTopbarPriceInFlight;
}

async function canUsePriceProvider() {
  const redisCount = await incrementCacheCounter('topbar:prices:provider-requests', 86_400);
  if (redisCount !== null) return redisCount <= maxRequestsPerDay;

  const dayAgo = Date.now() - 86_400_000;
  const attempts = (providerState.endorsecoinTopbarPriceFetches || []).filter(
    (timestamp) => timestamp > dayAgo,
  );

  if (attempts.length >= maxRequestsPerDay) {
    providerState.endorsecoinTopbarPriceFetches = attempts;
    return false;
  }

  providerState.endorsecoinTopbarPriceFetches = [...attempts, Date.now()];
  return true;
}

function readNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasPriceData(prices: TopbarPriceTicker[]) {
  return prices.some((price) => price.price !== null);
}

function getLastGoodPrices() {
  return hasPriceData(providerState.endorsecoinTopbarLastGoodPrices || [])
    ? providerState.endorsecoinTopbarLastGoodPrices!
    : fallbackPrices;
}
