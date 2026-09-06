import 'server-only';

import type { DiscoveryData, DiscoveryHotspots } from '@/features/coins/discovery-types';
import type { LeaderboardQuery } from '@/features/coins/leaderboard-types';
import { cacheKeyPart } from '@/lib/cache/cache-key';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';
import { db } from '@/lib/db/client';
import { coinBoosts, coinPromotions, coinVotes, coins } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { getPublicCoinListItemsByIds } from './coin-list';
import {
  getLeaderboardPage,
  getLeaderboardSelection,
  hydrateLeaderboardSelectionFromItems,
} from './leaderboard';
import { getCurrentVoteWeekStart } from './interactions';

const promotedCoinsLimit = 25;
const discoveryCacheSeconds = Number(process.env.DISCOVERY_CACHE_SECONDS || 30);
const promotedCoinsCacheSeconds = Number(process.env.PROMOTED_COINS_CACHE_SECONDS || 60);

export async function getDiscoveryData(query: LeaderboardQuery = {}): Promise<DiscoveryData> {
  if (!query.userId) return getCachedDiscoveryData(query);

  return readDiscoveryData(query);
}

async function getCachedDiscoveryData(query: LeaderboardQuery): Promise<DiscoveryData> {
  const [publicCoinsVersion, leaderboardVersion, promotedCoinsVersion] = await Promise.all([
    getCacheVersion('public-coins'),
    getCacheVersion('leaderboard'),
    getCacheVersion('promoted-coins'),
  ]);

  return rememberJson(
    buildDiscoveryCacheKey(query, publicCoinsVersion, leaderboardVersion, promotedCoinsVersion),
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
  query: LeaderboardQuery,
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
    query.sort || '',
    query.direction || '',
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
    getLeaderboardSelection({ view: 'trending', pageSize: 4 }),
    getLeaderboardSelection({ view: 'presales', pageSize: 4 }),
    getLeaderboardSelection({ view: 'watched', pageSize: 4 }),
    getCachedActivePromotedCoinIds(),
    getLeaderboardSelection(query),
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

async function getDiscoveryHotspots(userId?: string | null): Promise<DiscoveryHotspots> {
  const [recent, trending, presales, watched] = await Promise.all([
    getLeaderboardPage({ view: 'recent', pageSize: 4, userId }),
    getLeaderboardPage({ view: 'trending', pageSize: 4, userId }),
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
    [
      'promoted-coins',
      'active',
      version,
      getCurrentVoteWeekStart().toISOString(),
      'v1',
    ]
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
