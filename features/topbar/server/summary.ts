import 'server-only';

import { db } from '@/lib/db/client';
import { coinBoosts, coinVotes, coinWatchlists, coins, users } from '@/lib/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getCachedTopbarPrices } from './market-prices';
import type { TopbarCoinLink, TopbarSummary } from '@/features/topbar/types';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';

const summaryCacheSeconds = Number(process.env.TOPBAR_SUMMARY_CACHE_SECONDS || 60);

export async function getTopbarSummary() {
  const version = await getCacheVersion('topbar-summary');
  return rememberJson(
    `topbar:summary:${version}:v1`,
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
    const coinRows = await db
      .select({
        id: coins.id,
        name: coins.name,
        symbol: coins.symbol,
        logoUrl: coins.logoUrl,
      })
      .from(coins)
      .where(eq(coins.listingStatus, 'active'))
      .limit(500);

    const activeCoinIds = coinRows.map((coin) => coin.id);
    if (!activeCoinIds.length) return null;

    const [voteRows, boostRows] = await Promise.all([
      db
        .select({
          coinId: coinVotes.coinId,
          count: sql<number>`count(*)::int`,
        })
        .from(coinVotes)
        .where(inArray(coinVotes.coinId, activeCoinIds))
        .groupBy(coinVotes.coinId),
      db
        .select({
          coinId: coinBoosts.coinId,
          multiplier: coinBoosts.multiplier,
        })
        .from(coinBoosts)
        .where(
          and(
            inArray(coinBoosts.coinId, activeCoinIds),
            sql`${coinBoosts.status} in ('active', 'scheduled')`,
            sql`${coinBoosts.startsAt} <= ${nowIso}::timestamptz`,
            sql`${coinBoosts.expiresAt} > ${nowIso}::timestamptz`,
          ),
        )
        .catch((error) => {
          if (isMissingBoostTableError(error)) return [];
          throw error;
        }),
    ]);

    const votesByCoin = new Map(voteRows.map((row) => [row.coinId, row.count]));
    const boostByCoin = new Map(boostRows.map((row) => [row.coinId, row.multiplier]));
    const topCoin = coinRows
      .map((coin) => ({
        ...coin,
        boost: boostByCoin.get(coin.id) || null,
        effectiveVotes:
          (votesByCoin.get(coin.id) || 0) * getBoostVoteFactor(boostByCoin.get(coin.id)),
      }))
      .filter((coin) => coin.effectiveVotes > 0)
      .sort((a, b) => b.effectiveVotes - a.effectiveVotes || a.name.localeCompare(b.name))[0];

    return topCoin || null;
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

function getBoostVoteFactor(boostPackage: number | null | undefined) {
  if (boostPackage === 10 || boostPackage === 30) return 2;
  if (boostPackage === 50 || boostPackage === 100) return 3;
  if (boostPackage === 500) return 5;
  return 1;
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
