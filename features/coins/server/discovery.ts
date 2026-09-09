import 'server-only';

import type { DiscoveryData, DiscoveryHotspots } from '@/features/coins/discovery-types';
import type { LeaderboardQuery, LeaderboardSelection } from '@/features/coins/leaderboard-types';
import { cacheKeyPart } from '@/lib/cache/cache-key';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';
import { getReadyRedisClient } from '@/lib/cache/redis';
import { db } from '@/lib/db/client';
import { coinBoosts, coinPromotions, coinVotes, coins } from '@/lib/db/schema';
import { timeAsync } from '@/lib/observability/metrics';
import { sql } from 'drizzle-orm';
import { getPublicCoinListItemsByIds } from './coin-list';
import {
  getLeaderboardPage,
  getLeaderboardSelection,
  hydrateLeaderboardSelectionFromItems,
  normalizeLeaderboardQuery,
} from './leaderboard';
import { getCurrentVoteWeekStart } from './interactions';

const promotedCoinsLimit = 25;
const discoveryCacheSeconds = Number(process.env.DISCOVERY_CACHE_SECONDS || 30);
const promotedCoinsCacheSeconds = Number(process.env.PROMOTED_COINS_CACHE_SECONDS || 60);
const lastGoodTrendingCacheSeconds = 7 * 24 * 60 * 60;

export async function getDiscoveryData(query: LeaderboardQuery = {}): Promise<DiscoveryData> {
  return timeAsync(
    'server.operation',
    { operation: 'discovery', authenticated: Boolean(query.userId), page: query.page || 1 },
    () => (!query.userId ? getCachedDiscoveryData(query) : readDiscoveryData(query)),
  );
}

async function getCachedDiscoveryData(query: LeaderboardQuery): Promise<DiscoveryData> {
  const normalized = normalizeLeaderboardQuery(query);
  const [publicCoinsVersion, leaderboardVersion, promotedCoinsVersion] = await Promise.all([
    getCacheVersion('public-coins'),
    getCacheVersion('leaderboard'),
    getCacheVersion('promoted-coins'),
  ]);

  return rememberJson(
    buildDiscoveryCacheKey(
      normalized,
      publicCoinsVersion,
      leaderboardVersion,
      promotedCoinsVersion,
    ),
    { ttlSeconds: discoveryCacheSeconds },
    () => readDiscoveryData(query),
  );
}

async function readDiscoveryData(query: LeaderboardQuery = {}): Promise<DiscoveryData> {
  const selectionData = await getDiscoverySelections(query).catch((error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[discovery] batched discovery data unavailable:',
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  });

  if (!selectionData) {
    const [hotspots, promotedCoins, leaderboard] = await Promise.all([
      getDiscoveryHotspots(query.userId),
      getPromotedCoinItems(query.userId),
      getLeaderboardPage(query),
    ]);

    return {
      hotspots,
      promotedCoins,
      leaderboard,
    };
  }

  const allIds = uniqueNumbers([
    ...selectionData.recent.ids,
    ...selectionData.trending.ids,
    ...selectionData.presales.ids,
    ...selectionData.watched.ids,
    ...selectionData.promotedIds,
    ...selectionData.leaderboard.ids,
  ]);
  const hydratedItems = await getPublicCoinListItemsByIds(allIds, query.userId);
  const itemsById = new Map(hydratedItems.map((item) => [item.coinId, item]));
  const promotedCoins = selectionData.promotedIds.flatMap((id, index) => {
    const item = itemsById.get(id);
    return item ? [{ ...item, rank: index + 1 }] : [];
  });

  return {
    hotspots: {
      recent: hydrateLeaderboardSelectionFromItems(selectionData.recent, itemsById).rows,
      trending: hydrateLeaderboardSelectionFromItems(selectionData.trending, itemsById).rows,
      presales: hydrateLeaderboardSelectionFromItems(selectionData.presales, itemsById).rows,
      watched: hydrateLeaderboardSelectionFromItems(selectionData.watched, itemsById).rows,
    },
    promotedCoins,
    leaderboard: hydrateLeaderboardSelectionFromItems(selectionData.leaderboard, itemsById),
  };
}

function buildDiscoveryCacheKey(
  query: ReturnType<typeof normalizeLeaderboardQuery>,
  publicCoinsVersion: number,
  leaderboardVersion: number,
  promotedCoinsVersion: number,
) {
  return [
    'discovery',
    publicCoinsVersion,
    leaderboardVersion,
    promotedCoinsVersion,
    query.view || '',
    query.category || '',
    query.chain || '',
    query.search || '',
    query.sort.key,
    query.sort.direction,
    query.page || '',
    query.pageSize || '',
    'v1',
  ]
    .map(cacheKeyPart)
    .join(':');
}

async function getDiscoverySelections(query: LeaderboardQuery = {}) {
  const [recent, trending, presales, watched, promotedIds, leaderboard] = await Promise.all([
    getLeaderboardSelection({ view: 'recent', pageSize: 4 }),
    getStickyTrendingSelection({ pageSize: 4 }),
    getLeaderboardSelection({ view: 'presales', pageSize: 4 }),
    getLeaderboardSelection({ view: 'watched', pageSize: 4 }),
    getCachedActivePromotedCoinIds(),
    getDiscoveryLeaderboardSelection(query),
  ]);

  return {
    recent,
    trending,
    presales,
    watched,
    promotedIds,
    leaderboard,
  };
}

async function getDiscoveryLeaderboardSelection(query: LeaderboardQuery = {}) {
  if (query.view === 'trending') return getStickyTrendingSelection(query);

  return getLeaderboardSelection(query);
}

async function getStickyTrendingSelection(query: LeaderboardQuery = {}) {
  const current = await getLeaderboardSelection({ ...query, view: 'trending' });
  if (current.ids.length) {
    void writeLastGoodTrendingSelection(current);
    return current;
  }

  return (await readLastGoodTrendingSelection(current)) ?? current;
}

async function getStickyTrendingPage(userId?: string | null) {
  const current = await getLeaderboardPage({ view: 'trending', pageSize: 4, userId });
  if (current.rows.length) return current;

  const currentSelection = leaderboardPageToSelection(current);
  const lastGood = await readLastGoodTrendingSelection(currentSelection);
  if (!lastGood?.ids.length) return current;

  const items = await getPublicCoinListItemsByIds(lastGood.ids, userId);
  const itemsById = new Map(items.map((item) => [item.coinId, item]));
  return hydrateLeaderboardSelectionFromItems(lastGood, itemsById);
}

async function readLastGoodTrendingSelection(selectionKey: LeaderboardSelection) {
  try {
    const redis = await getReadyRedisClient();
    if (!redis) return null;

    const raw = await redis.get(lastGoodTrendingCacheKey(selectionKey));
    if (!raw) return null;

    const selection = JSON.parse(raw) as LeaderboardSelection;
    return isValidTrendingSelection(selection) ? selection : null;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[discovery] sticky trending read skipped:',
        error instanceof Error ? error.message : error,
      );
    }

    return null;
  }
}

async function writeLastGoodTrendingSelection(selection: LeaderboardSelection) {
  if (!selection.ids.length) return;

  try {
    const redis = await getReadyRedisClient();
    if (!redis) return;

    await redis.set(
      lastGoodTrendingCacheKey(selection),
      JSON.stringify(selection),
      'EX',
      lastGoodTrendingCacheSeconds,
    );
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[discovery] sticky trending write skipped:',
        error instanceof Error ? error.message : error,
      );
    }
  }
}

function isValidTrendingSelection(value: unknown): value is LeaderboardSelection {
  if (!value || typeof value !== 'object') return false;

  const selection = value as Partial<LeaderboardSelection>;
  return (
    selection.view === 'trending' &&
    Array.isArray(selection.ids) &&
    selection.ids.every((id) => Number.isSafeInteger(id) && id > 0) &&
    Number.isSafeInteger(selection.page) &&
    Number.isSafeInteger(selection.pageSize) &&
    Number.isSafeInteger(selection.pages) &&
    Number.isSafeInteger(selection.total)
  );
}

function lastGoodTrendingCacheKey(selection: LeaderboardSelection) {
  return [
    'discovery',
    'trending',
    'last-good',
    selection.category,
    selection.chain,
    selection.search,
    selection.sort.key,
    selection.sort.direction,
    selection.page,
    selection.pageSize,
    'v1',
  ]
    .map(cacheKeyPart)
    .join(':');
}

function leaderboardPageToSelection(page: Awaited<ReturnType<typeof getLeaderboardPage>>) {
  const { rows, ...selection } = page;
  return { ...selection, ids: rows.map((row) => row.coinId) };
}

async function getDiscoveryHotspots(userId?: string | null): Promise<DiscoveryHotspots> {
  const [recent, trending, presales, watched] = await Promise.all([
    getLeaderboardPage({ view: 'recent', pageSize: 4, userId }),
    getStickyTrendingPage(userId),
    getLeaderboardPage({ view: 'presales', pageSize: 4, userId }),
    getLeaderboardPage({ view: 'watched', pageSize: 4, userId }),
  ]);

  return {
    recent: recent.rows,
    trending: trending.rows,
    presales: presales.rows,
    watched: watched.rows,
  };
}

export async function getPromotedCoinItems(userId?: string | null) {
  const ids = await getCachedActivePromotedCoinIds().catch((error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[discovery] promoted coin query unavailable:',
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  });

  if (!ids.length) return [];
  const items = await getPublicCoinListItemsByIds(ids, userId);
  const itemById = new Map(items.map((item) => [item.coinId, item]));
  return ids.flatMap((id, index) => {
    const item = itemById.get(id);
    return item ? [{ ...item, rank: index + 1 }] : [];
  });
}

async function getCachedActivePromotedCoinIds() {
  const version = await getCacheVersion('promoted-coins');
  return rememberJson(
    ['promoted-coins', 'active', version, getCurrentVoteWeekStart().toISOString(), 'v1']
      .map(cacheKeyPart)
      .join(':'),
    { ttlSeconds: promotedCoinsCacheSeconds },
    selectActivePromotedCoinIds,
  );
}

async function selectActivePromotedCoinIds() {
  const nowIso = new Date().toISOString();
  const weekStartIso = getCurrentVoteWeekStart().toISOString();
  const rows = await db.execute<{ id: number }>(sql`
    with weekly_votes as (
      select ${coinVotes.coinId} as coin_id, count(*)::int as count
      from ${coinVotes}
      where ${coinVotes.weekStartsAt} = ${weekStartIso}::timestamptz
      group by ${coinVotes.coinId}
    ),
    active_boosts as (
      select distinct on (${coinBoosts.coinId})
        ${coinBoosts.coinId} as coin_id,
        ${coinBoosts.multiplier} as multiplier
      from ${coinBoosts}
      where ${coinBoosts.status} in ('active', 'scheduled')
        and ${coinBoosts.startsAt} <= ${nowIso}::timestamptz
        and ${coinBoosts.expiresAt} > ${nowIso}::timestamptz
      order by ${coinBoosts.coinId}, ${coinBoosts.expiresAt} desc
    )
    select ${coins.id} as id
    from ${coinPromotions}
    inner join ${coins} on ${coins.id} = ${coinPromotions.coinId}
    left join weekly_votes on weekly_votes.coin_id = ${coins.id}
    left join active_boosts on active_boosts.coin_id = ${coins.id}
    where ${coins.listingStatus} = 'active'
      and ${coinPromotions.status} in ('active', 'scheduled')
      and ${coinPromotions.startsAt} <= ${nowIso}::timestamptz
      and ${coinPromotions.expiresAt} > ${nowIso}::timestamptz
    order by
      (coalesce(weekly_votes.count, 0) * case
        when active_boosts.multiplier in (10, 30) then 2
        when active_boosts.multiplier in (50, 100) then 3
        when active_boosts.multiplier = 500 then 5
        else 1
      end) desc,
      ${coinPromotions.priority} desc,
      ${coinPromotions.expiresAt} desc,
      ${coins.name} asc
    limit ${promotedCoinsLimit}
  `);

  return Array.from(rows, (row) => Number(row.id));
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values));
}
