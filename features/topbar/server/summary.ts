import 'server-only';

import { db } from '@/lib/db/client';
import { coinBoosts, coinVotes, coinWatchlists, coins, users } from '@/lib/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getCurrentVoteWeekStart } from '@/features/coins/server/interactions';
import { getCachedTopbarPrices } from './market-prices';
import type { TopbarCoinLink, TopbarSummary } from '@/features/topbar/types';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';

const summaryCacheSeconds = Number(process.env.TOPBAR_SUMMARY_CACHE_SECONDS || 60);

export async function getTopbarSummary() {
  const version = await getCacheVersion('topbar-summary');
  return rememberJson(
    `topbar:summary:${version}:v2`,
    { ttlSeconds: summaryCacheSeconds },
    readTopbarSummary,
  );
}

async function readTopbarSummary(): Promise<TopbarSummary> {
  const [prices, dbSummary] = await Promise.all([getCachedTopbarPrices(), readDatabaseSummary()]);

  return {
    prices,
    ...dbSummary,
  };
}

async function readDatabaseSummary() {
  const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [userCountRows, projectCountRows, voteCountRows, trendingCoin, topVotedCoin] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(coins)
        .where(eq(coins.listingStatus, 'active')),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(coinVotes)
        .catch((error) => {
          if (isMissingInteractionTableError(error)) return [{ count: 0 }];
          throw error;
        }),
      readTrendingCoin(dayAgoIso),
      readTopVotedCoin(),
    ]);

  return {
    users: readCount(userCountRows),
    projects: readCount(projectCountRows),
    totalVotes: readCount(voteCountRows),
    trendingCoin,
    topVotedCoin,
  };
}

async function readTrendingCoin(dayAgoIso: string): Promise<TopbarCoinLink> {
  try {
    const [voteRows, watchRows] = await Promise.all([
      db
        .select({
          coinId: coinVotes.coinId,
          count: sql<number>`count(*)::int`,
        })
        .from(coinVotes)
        .where(sql`${coinVotes.createdAt} >= ${dayAgoIso}::timestamptz`)
        .groupBy(coinVotes.coinId)
        .orderBy(desc(sql<number>`count(*)::int`))
        .limit(25),
      db
        .select({
          coinId: coinWatchlists.coinId,
          count: sql<number>`count(*)::int`,
        })
        .from(coinWatchlists)
        .where(sql`${coinWatchlists.createdAt} >= ${dayAgoIso}::timestamptz`)
        .groupBy(coinWatchlists.coinId)
        .orderBy(desc(sql<number>`count(*)::int`))
        .limit(25),
    ]);

    const activityByCoin = new Map<number, number>();
    voteRows.forEach((row) => activityByCoin.set(row.coinId, row.count * 3));
    watchRows.forEach((row) =>
      activityByCoin.set(row.coinId, (activityByCoin.get(row.coinId) || 0) + row.count * 2),
    );

    const rankedCoinIds = Array.from(activityByCoin.entries())
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([coinId]) => coinId);

    if (!rankedCoinIds.length) return null;

    const coinRows = await db
      .select({
        id: coins.id,
        name: coins.name,
        symbol: coins.symbol,
        logoUrl: coins.logoUrl,
      })
      .from(coins)
      .where(and(inArray(coins.id, rankedCoinIds), eq(coins.listingStatus, 'active')));

    const boostByCoin = await readActiveBoosts(rankedCoinIds);
    const coinById = new Map(coinRows.map((coin) => [coin.id, coin]));
    const topCoin = rankedCoinIds
      .map((coinId) => {
        const coin = coinById.get(coinId);
        if (!coin) return null;
        return { ...coin, boost: boostByCoin.get(coin.id) || null };
      })
      .find(Boolean);
    return topCoin || null;
  } catch (error) {
    if (isMissingInteractionTableError(error)) return null;
    throw error;
  }
}

async function readTopVotedCoin(): Promise<TopbarCoinLink> {
  try {
    const nowIso = new Date().toISOString();
    const weekStartIso = getCurrentVoteWeekStart().toISOString();
    const rows = await db.execute<{
      id: number;
      name: string;
      symbol: string;
      logoUrl: string | null;
      boost: number | null;
      boostedVotes: number | string;
    }>(sql`
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
      ),
      ranked as (
        select
          ${coins.id} as id,
          ${coins.name} as name,
          ${coins.symbol} as symbol,
          ${coins.logoUrl} as "logoUrl",
          active_boosts.multiplier as boost,
          (coalesce(weekly_votes.count, 0) * case
            when active_boosts.multiplier in (10, 30) then 2
            when active_boosts.multiplier in (50, 100) then 3
            when active_boosts.multiplier = 500 then 5
            else 1
          end) as "boostedVotes"
        from ${coins}
        left join weekly_votes on weekly_votes.coin_id = ${coins.id}
        left join active_boosts on active_boosts.coin_id = ${coins.id}
        where ${coins.listingStatus} = 'active'
      )
      select id, name, symbol, "logoUrl", boost, "boostedVotes"
      from ranked
      where "boostedVotes" > 0
      order by "boostedVotes" desc, name asc, id asc
      limit 1
    `);

    const topCoin = rows[0];
    if (!topCoin) return null;

    return {
      id: topCoin.id,
      name: topCoin.name,
      symbol: topCoin.symbol,
      logoUrl: topCoin.logoUrl,
      boost: topCoin.boost || null,
    };
  } catch (error) {
    if (isMissingInteractionTableError(error) || isMissingBoostTableError(error)) return null;
    throw error;
  }
}

async function readActiveBoosts(coinIds: number[]) {
  if (!coinIds.length) return new Map<number, number>();

  try {
    const nowIso = new Date().toISOString();
    const boostRows = await db
      .select({
        coinId: coinBoosts.coinId,
        multiplier: coinBoosts.multiplier,
      })
      .from(coinBoosts)
      .where(
        and(
          inArray(coinBoosts.coinId, coinIds),
          sql`${coinBoosts.status} in ('active', 'scheduled')`,
          sql`${coinBoosts.startsAt} <= ${nowIso}::timestamptz`,
          sql`${coinBoosts.expiresAt} > ${nowIso}::timestamptz`,
        ),
      );

    return new Map(boostRows.map((row) => [row.coinId, row.multiplier]));
  } catch (error) {
    if (isMissingBoostTableError(error)) return new Map<number, number>();
    throw error;
  }
}

function readCount(rows: Array<{ count: number }>) {
  return rows[0]?.count ?? 0;
}

function isMissingInteractionTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : null;
  const causeMessage = cause instanceof Error ? cause.message : '';

  return (
    message.includes('coin_votes') ||
    message.includes('coin_watchlists') ||
    causeMessage.includes('coin_votes') ||
    causeMessage.includes('coin_watchlists')
  );
}

function isMissingBoostTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : null;
  const causeMessage = cause instanceof Error ? cause.message : '';

  return message.includes('coin_boosts') || causeMessage.includes('coin_boosts');
}
