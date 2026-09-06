import 'server-only';

import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';
import { db } from '@/lib/db/client';
import { coinBoosts, coins, coinVotes } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { getCurrentVoteWeekStart } from './interactions';

const communityRankCacheSeconds = Number(process.env.LEADERBOARD_CACHE_SECONDS || 30);

type RankRow = {
  id: number;
  rank: number | string;
};

export async function getDefaultCommunityRankForCoin(coinId: number): Promise<number | null> {
  const version = await getCacheVersion('leaderboard');
  return rememberJson(
    `leaderboard:default-rank:${version}:${coinId}:v1`,
    { ttlSeconds: communityRankCacheSeconds },
    () => selectDefaultCommunityRankForCoin(coinId),
  );
}

async function selectDefaultCommunityRankForCoin(coinId: number): Promise<number | null> {
  const nowIso = new Date().toISOString();
  const weekStartIso = getCurrentVoteWeekStart().toISOString();

  const rows = await db.execute<RankRow>(sql`
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
        row_number() over (
          order by
            (coalesce(weekly_votes.count, 0) * case
              when active_boosts.multiplier in (10, 30) then 2
              when active_boosts.multiplier in (50, 100) then 3
              when active_boosts.multiplier = 500 then 5
              else 1
            end) desc,
            ${coins.name} asc,
            ${coins.id} asc
        ) as rank
      from ${coins}
      left join weekly_votes on weekly_votes.coin_id = ${coins.id}
      left join active_boosts on active_boosts.coin_id = ${coins.id}
      where ${coins.listingStatus} = 'active'
    )
    select id, rank
    from ranked
    where id = ${coinId}
    limit 1
  `);

  const rank = Number(rows[0]?.rank);
  return Number.isFinite(rank) && rank > 0 ? rank : null;
}
