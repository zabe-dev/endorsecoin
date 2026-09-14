import 'server-only';

import { db } from '@/lib/db/client';
import { coinVotes, coins, users } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getCurrentTrendingPage } from '@/features/coins/server/discovery';
import { getLeaderboardPage } from '@/features/coins/server/leaderboard';
import { getCachedTopbarPrices } from './market-prices';
import type { TopbarCoinLink, TopbarSummary } from '@/features/topbar/types';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';

const summaryCacheSeconds = Number(process.env.TOPBAR_SUMMARY_CACHE_SECONDS || 60);
const usersDisplayOffset = readEnvInteger('TOPBAR_USERS_DISPLAY_OFFSET', 300);
const totalVotesDisplayOffset = readEnvInteger('TOPBAR_TOTAL_VOTES_DISPLAY_OFFSET', 5_000);

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
      readTrendingCoin(),
      readTopVotedCoin(),
    ]);

  return {
    users: readCount(userCountRows) + usersDisplayOffset,
    projects: readCount(projectCountRows),
    totalVotes: readCount(voteCountRows) + totalVotesDisplayOffset,
    trendingCoin,
    topVotedCoin,
  };
}

function readEnvInteger(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isSafeInteger(value) ? value : fallback;
}

async function readTrendingCoin(): Promise<TopbarCoinLink> {
  const page = await getCurrentTrendingPage();
  return toTopbarCoin(page.rows[0]);
}

async function readTopVotedCoin(): Promise<TopbarCoinLink> {
  const page = await getLeaderboardPage({ view: 'top', pageSize: 1 });
  return toTopbarCoin(page.rows[0]);
}

function toTopbarCoin(coin: Awaited<ReturnType<typeof getLeaderboardPage>>['rows'][number] | undefined): TopbarCoinLink {
  if (!coin) return null;
  return {
    id: coin.coinId,
    name: coin.name,
    symbol: coin.symbol,
    logoUrl: coin.image ?? null,
    boost: coin.boost ?? null,
  };
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
