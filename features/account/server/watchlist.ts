import type { PublicWatchedCoin } from '@/features/account/components/account-panel';
import type { AccountTablePage } from '@/features/account/types';
import { getPublicCoinListItemsByIds } from '@/features/coins/server/coin-list';
import { isMissingInteractionTableError } from '@/features/coins/server/interactions';
import { cacheKeyPart } from '@/lib/cache/cache-key';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';
import { db } from '@/lib/db/client';
import { coinWatchlists, coins } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

const watchlistCacheSeconds = Number(process.env.PUBLIC_WATCHLIST_CACHE_SECONDS || 60);
const defaultPageSize = 25;

type WatchedCoinRecord = {
  coinId: number;
  savedAt: string;
};

export type WatchlistTablePage = AccountTablePage & {
  rows: PublicWatchedCoin[];
};

export async function getWatchlistTableRows(
  userId: string,
  viewerId?: string | null,
): Promise<PublicWatchedCoin[]> {
  const page = await getWatchlistTablePage(userId, viewerId, { page: 1, pageSize: 500 });
  return page.rows;
}

export async function getWatchlistTablePage(
  userId: string,
  viewerId?: string | null,
  options: { page?: string | number | null; pageSize?: string | number | null } = {},
): Promise<WatchlistTablePage> {
  const pageSize = normalizePositiveInteger(options.pageSize, defaultPageSize, 100);
  const requestedPage = normalizePositiveInteger(options.page, 1, Number.MAX_SAFE_INTEGER);
  const watchedCoins =
    viewerId === userId
      ? await readWatchedCoinRecords(userId, requestedPage, pageSize)
      : await getCachedPublicWatchedCoinRecords(userId, requestedPage, pageSize);

  const total = watchedCoins.total;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pages);

  if (!watchedCoins.rows.length && total > 0 && requestedPage > 1) {
    return getWatchlistTablePage(userId, viewerId, { page: 1, pageSize });
  }

  if (!watchedCoins.rows.length) {
    return { rows: [], total, page, pageSize, pages };
  }

  const savedAtByCoinId = new Map(watchedCoins.rows.map((coin) => [coin.coinId, coin.savedAt]));
  const watchedOrder = new Map(watchedCoins.rows.map((coin, index) => [coin.coinId, index]));
  const hydratedCoins = await getPublicCoinListItemsByIds(
    watchedCoins.rows.map((coin) => coin.coinId),
    viewerId,
  );

  const rows = hydratedCoins
    .map((coin) => ({
      ...coin,
      rank: (page - 1) * pageSize + (watchedOrder.get(coin.coinId) ?? 0) + 1,
      savedAt: savedAtByCoinId.get(coin.coinId) || coin.submittedTimestamp,
    }))
    .sort(
      (a, b) =>
        (watchedOrder.get(a.coinId) ?? Number.MAX_SAFE_INTEGER) -
        (watchedOrder.get(b.coinId) ?? Number.MAX_SAFE_INTEGER),
    );

  return { rows, total, page, pageSize, pages };
}

async function getCachedPublicWatchedCoinRecords(userId: string, page: number, pageSize: number) {
  const version = await getCacheVersion('public-watchlists');
  return rememberJson(
    `watchlist:public:${version}:${cacheKeyPart(userId)}:${page}:${pageSize}:v2`,
    { ttlSeconds: watchlistCacheSeconds },
    () => readWatchedCoinRecords(userId, page, pageSize),
  );
}

async function readWatchedCoinRecords(
  userId: string,
  page: number,
  pageSize: number,
): Promise<{ rows: WatchedCoinRecord[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [countRows, watchedCoins] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(coinWatchlists)
      .innerJoin(coins, eq(coins.id, coinWatchlists.coinId))
      .where(and(eq(coinWatchlists.userId, userId), eq(coins.listingStatus, 'active'))),
    db
      .select({
        coinId: coins.id,
        createdAt: coinWatchlists.createdAt,
      })
      .from(coinWatchlists)
      .innerJoin(coins, eq(coins.id, coinWatchlists.coinId))
      .where(and(eq(coinWatchlists.userId, userId), eq(coins.listingStatus, 'active')))
      .orderBy(desc(coinWatchlists.createdAt))
      .limit(pageSize)
      .offset(offset),
  ]).catch((error) => {
      if (isMissingInteractionTableError(error)) return [[], []] as const;
      throw error;
    });

  if (!Array.isArray(countRows)) return { rows: [], total: 0 };

  return {
    total: Number(countRows[0]?.count || 0),
    rows: watchedCoins.map((coin) => ({
      coinId: coin.coinId,
      savedAt: coin.createdAt.toISOString(),
    })),
  };
}

function normalizePositiveInteger(
  value: string | number | null | undefined,
  fallback: number,
  max: number,
) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}
