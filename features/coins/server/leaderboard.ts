import 'server-only';

import { NETWORKS, type NetworkConfig } from '@/features/coins/networks';
import type {
  LeaderboardPage,
  LeaderboardQuery,
  LeaderboardSelection,
  LeaderboardView,
} from '@/features/coins/leaderboard-types';
import {
  coinCategories,
  coinChainOptions,
  type CoinListItem,
  type CoinSortKey,
} from '@/features/coins/view';
import { cacheKeyPart } from '@/lib/cache/cache-key';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';
import { db } from '@/lib/db/client';
import {
  coinBoosts,
  coins,
  coinSubmissions,
  coinVotes,
  coinWatchlists,
  marketSnapshots,
} from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { getPublicCoinListItems, getPublicCoinListItemsByIds } from './coin-list';
import { getCurrentVoteWeekStart } from './interactions';

const defaultView: LeaderboardView = 'top';
const defaultSort: { key: CoinSortKey; direction: 'asc' | 'desc' } = {
  key: 'votes',
  direction: 'desc',
};
const maxPageSize = 100;
const leaderboardCacheSeconds = Number(process.env.LEADERBOARD_CACHE_SECONDS || 30);

export async function getLeaderboardPage(query: LeaderboardQuery = {}): Promise<LeaderboardPage> {
  const databaseSelection = await getLeaderboardSelection(query).catch((error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[leaderboard] database paging unavailable, falling back to cached list:',
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  });

  if (databaseSelection) return hydrateLeaderboardSelection(databaseSelection, query.userId);

  const coins = await getPublicCoinListItems(query.userId);
  return getLeaderboardPageFromCoins(coins, query);
}

export async function getLeaderboardSelection(
  query: LeaderboardQuery = {},
): Promise<LeaderboardSelection> {
  const normalized = normalizeLeaderboardQuery(query);
  const rows = await getCachedLeaderboardCoinIds(normalized);
  const total = Number(rows[0]?.totalCount || 0);
  const pages = Math.max(1, Math.ceil(total / normalized.pageSize));
  const page = Math.min(normalized.page, pages);

  if (!rows.length && total === 0) {
    return {
      ids: [],
      total,
      page,
      pageSize: normalized.pageSize,
      pages,
      view: normalized.view,
      category: normalized.category,
      chain: normalized.chain,
      search: normalized.search,
      sort: normalized.sort,
    };
  }

  if (!rows.length && normalized.page > 1) {
    return getLeaderboardSelection({ ...query, page: 1 });
  }

  return {
    ids: rows.map((row) => Number(row.id)),
    total,
    page,
    pageSize: normalized.pageSize,
    pages,
    view: normalized.view,
    category: normalized.category,
    chain: normalized.chain,
    search: normalized.search,
    sort: normalized.sort,
  };
}

export async function hydrateLeaderboardSelection(
  selection: LeaderboardSelection,
  userId?: string | null,
): Promise<LeaderboardPage> {
  const { ids, ...page } = selection;
  const start = (selection.page - 1) * selection.pageSize;
  const coinItems = await getPublicCoinListItemsByIds(ids, userId);

  return {
    ...page,
    rows: coinItems.map((coin, index) => ({ ...coin, rank: start + index + 1 })),
  };
}

export function hydrateLeaderboardSelectionFromItems(
  selection: LeaderboardSelection,
  itemsById: Map<number, CoinListItem>,
): LeaderboardPage {
  const { ids, ...page } = selection;
  const start = (selection.page - 1) * selection.pageSize;

  return {
    ...page,
    rows: ids.flatMap((id, index) => {
      const coin = itemsById.get(id);
      return coin ? [{ ...coin, rank: start + index + 1 }] : [];
    }),
  };
}

export function getLeaderboardPageFromCoins(
  coins: CoinListItem[],
  query: LeaderboardQuery = {},
): LeaderboardPage {
  const normalized = normalizeLeaderboardQuery(query);
  const filteredCoins = filterCoins(coins, normalized);
  const sortedCoins = sortLeaderboardCoins(filteredCoins, normalized);
  const total = sortedCoins.length;
  const pages = Math.max(1, Math.ceil(total / normalized.pageSize));
  const page = Math.min(normalized.page, pages);
  const start = (page - 1) * normalized.pageSize;
  const rows = sortedCoins.slice(start, start + normalized.pageSize).map((coin, index) => ({
    ...coin,
    rank: start + index + 1,
  }));

  return {
    rows,
    total,
    page,
    pageSize: normalized.pageSize,
    pages,
    view: normalized.view,
    category: normalized.category,
    chain: normalized.chain,
    search: normalized.search,
    sort: normalized.sort,
  };
}

type NormalizedLeaderboardQuery = ReturnType<typeof normalizeLeaderboardQuery>;
type LeaderboardIdRow = {
  id: number;
  totalCount: number | string;
};

async function getCachedLeaderboardCoinIds(query: NormalizedLeaderboardQuery) {
  const version = await getCacheVersion('leaderboard');
  return rememberJson(
    buildLeaderboardCacheKey(query, version),
    { ttlSeconds: leaderboardCacheSeconds },
    () => selectLeaderboardCoinIds(query),
  );
}

async function selectLeaderboardCoinIds(
  query: NormalizedLeaderboardQuery,
): Promise<LeaderboardIdRow[]> {
  const nowIso = new Date().toISOString();
  const weekStartIso = getCurrentVoteWeekStart().toISOString();
  const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
  const offset = (query.page - 1) * query.pageSize;
  const where = buildLeaderboardWhere(query, nowIso);
  const scoredWhere = buildScoredLeaderboardWhere(query, nowIso);
  const orderBy = buildLeaderboardOrderBy(query);

  const result = await db.execute<LeaderboardIdRow>(sql`
    with latest_market as (
      select distinct on (${marketSnapshots.coinId})
        ${marketSnapshots.coinId} as coin_id,
        ${marketSnapshots.priceUsd} as price_usd,
        ${marketSnapshots.marketCapUsd} as market_cap_usd,
        ${marketSnapshots.change24h} as change_24h,
        ${marketSnapshots.recordedAt} as recorded_at
      from ${marketSnapshots}
      order by ${marketSnapshots.coinId}, ${marketSnapshots.recordedAt} desc
    ),
    latest_submission as (
      select distinct on (${coinSubmissions.coinId})
        ${coinSubmissions.coinId} as coin_id,
        ${coinSubmissions.coinData} as coin_data,
        ${coinSubmissions.createdAt} as created_at
      from ${coinSubmissions}
      where ${coinSubmissions.coinId} is not null
        and ${coinSubmissions.submissionType} = 'new-coin'
      order by ${coinSubmissions.coinId}, ${coinSubmissions.createdAt} desc
    ),
    weekly_votes as (
      select ${coinVotes.coinId} as coin_id, count(*)::int as count
      from ${coinVotes}
      where ${coinVotes.weekStartsAt} = ${weekStartIso}::timestamptz
      group by ${coinVotes.coinId}
    ),
    recent_votes as (
      select ${coinVotes.coinId} as coin_id, count(*)::int as count
      from ${coinVotes}
      where ${coinVotes.createdAt} >= ${dayAgoIso}::timestamptz
      group by ${coinVotes.coinId}
    ),
    watch_counts as (
      select ${coinWatchlists.coinId} as coin_id, count(*)::int as count
      from ${coinWatchlists}
      group by ${coinWatchlists.coinId}
    ),
    recent_watch_counts as (
      select ${coinWatchlists.coinId} as coin_id, count(*)::int as count
      from ${coinWatchlists}
      where ${coinWatchlists.createdAt} >= ${dayAgoIso}::timestamptz
      group by ${coinWatchlists.coinId}
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
    scored as (
      select
        ${coins.id} as id,
        ${coins.name} as name,
        ${coins.symbol} as symbol,
        ${coins.chain} as chain,
        ${coins.category} as category,
        ${coins.isPresale} as is_presale,
        ${coins.launchDate} as launch_date,
        ${coins.submittedAt} as submitted_at,
        coalesce(weekly_votes.count, 0) as raw_votes,
        coalesce(watch_counts.count, 0) as watch_count,
        coalesce(recent_votes.count, 0) as recent_votes,
        coalesce(recent_watch_counts.count, 0) as recent_watch_count,
        (coalesce(recent_votes.count, 0) * 3 + coalesce(recent_watch_counts.count, 0) * 2) as trending_score,
        (coalesce(weekly_votes.count, 0) * case
          when active_boosts.multiplier in (10, 30) then 2
          when active_boosts.multiplier in (50, 100) then 3
          when active_boosts.multiplier = 500 then 5
          else 1
        end) as boosted_votes,
        coalesce(active_boosts.multiplier, 0) as boost_multiplier,
        coalesce(latest_market.market_cap_usd, 0)::numeric as market_cap_usd,
        coalesce(latest_market.price_usd, 0)::numeric as price_usd,
        coalesce(latest_market.change_24h, 0)::numeric as change_24h,
        ${presaleEndDateSql()} as presale_end_at
      from ${coins}
      left join latest_market on latest_market.coin_id = ${coins.id}
      left join latest_submission on latest_submission.coin_id = ${coins.id}
      left join weekly_votes on weekly_votes.coin_id = ${coins.id}
      left join recent_votes on recent_votes.coin_id = ${coins.id}
      left join watch_counts on watch_counts.coin_id = ${coins.id}
      left join recent_watch_counts on recent_watch_counts.coin_id = ${coins.id}
      left join active_boosts on active_boosts.coin_id = ${coins.id}
      where ${sql.join(where, sql` and `)}
    )
    select id, count(*) over()::int as "totalCount"
    from scored
    where ${sql.join(scoredWhere, sql` and `)}
    order by ${orderBy}
    limit ${query.pageSize}
    offset ${offset}
  `);

  return Array.from(result);
}

function buildLeaderboardCacheKey(query: NormalizedLeaderboardQuery, version: number) {
  return [
    'leaderboard',
    version,
    getCurrentVoteWeekStart().toISOString(),
    query.view,
    query.category,
    query.chain,
    query.search.toLowerCase(),
    query.sort.key,
    query.sort.direction,
    query.page,
    query.pageSize,
    'v1',
  ]
    .map(cacheKeyPart)
    .join(':');
}

function buildLeaderboardWhere(query: NormalizedLeaderboardQuery, nowIso: string) {
  const where = [sql`${coins.listingStatus} = 'active'`];
  const chainId = getNetworkIdFromShortName(query.chain);

  if (query.category !== 'All') where.push(sql`${coins.category} = ${query.category}`);
  if (chainId) where.push(sql`${coins.chain} = ${chainId}`);
  if (query.search) {
    const search = `%${query.search.toLowerCase()}%`;
    where.push(sql`(
      lower(${coins.name}) like ${search}
      or lower(${coins.symbol}) like ${search}
      or lower(coalesce(${coins.chain}, '')) like ${search}
    )`);
  }

  return where;
}

function buildScoredLeaderboardWhere(query: NormalizedLeaderboardQuery, nowIso: string) {
  const where = [sql`true`];

  if (query.view === 'presales') {
    where.push(sql`is_presale = true`);
    where.push(sql`presale_end_at > ${nowIso}::timestamptz`);
  } else if (query.view === 'trending') {
    where.push(sql`trending_score > 0`);
  } else if (query.view === 'watched') {
    where.push(sql`watch_count > 0`);
  } else if (query.view === 'recent') {
    where.push(sql`is_presale = false`);
    where.push(sql`launch_date is not null`);
    where.push(sql`launch_date <= ${nowIso}::timestamptz`);
  }

  return where;
}

function buildLeaderboardOrderBy(query: NormalizedLeaderboardQuery) {
  if (isDefaultSort(query.sort)) {
    if (query.view === 'trending') return sql`trending_score desc, boosted_votes desc, name asc`;
    if (query.view === 'watched') return sql`watch_count desc, boosted_votes desc, name asc`;
    if (query.view === 'recent')
      return sql`launch_date desc nulls last, boosted_votes desc, name asc`;
    if (query.view === 'presales')
      return sql`presale_end_at asc nulls last, boosted_votes desc, name asc`;
    return sql`boosted_votes desc, name asc`;
  }

  return buildCustomOrderBy(query.sort);
}

function buildCustomOrderBy(sort: { key: CoinSortKey; direction: 'asc' | 'desc' }) {
  const descending = sort.direction === 'desc';

  if (sort.key === 'name') return descending ? sql`name desc` : sql`name asc`;
  if (sort.key === 'capN')
    return descending ? sql`market_cap_usd desc nulls last` : sql`market_cap_usd asc nulls last`;
  if (sort.key === 'price')
    return descending ? sql`price_usd desc nulls last` : sql`price_usd asc nulls last`;
  if (sort.key === 'change')
    return descending ? sql`change_24h desc nulls last` : sql`change_24h asc nulls last`;
  if (sort.key === 'launch')
    return descending ? sql`launch_date desc nulls last` : sql`launch_date asc nulls last`;
  if (sort.key === 'boost')
    return descending ? sql`boost_multiplier desc` : sql`boost_multiplier asc`;
  if (sort.key === 'age')
    return descending ? sql`submitted_at desc` : sql`submitted_at asc`;
  if (sort.key === 'rank') return descending ? sql`id desc` : sql`id asc`;
  return descending ? sql`boosted_votes desc` : sql`boosted_votes asc`;
}

function presaleEndDateSql() {
  return sql`
    case
      when nullif(latest_submission.coin_data #>> '{market,presale,endDate}', '') ~ '^\\d{4}-\\d{2}-\\d{2}'
      then nullif(latest_submission.coin_data #>> '{market,presale,endDate}', '')::timestamptz
      else null
    end
  `;
}

function getNetworkIdFromShortName(shortName: string) {
  if (shortName === 'All chains') return '';
  const network = Object.values(NETWORKS).find(
    (item: NetworkConfig) => item.enabled && item.shortName === shortName,
  );
  return network?.id || '';
}

function normalizeLeaderboardQuery(query: LeaderboardQuery) {
  const view = normalizeView(query.view);
  const category = normalizeCategory(query.category);
  const chain = normalizeChain(query.chain);
  const sort = normalizeSort(query.sort, query.direction);
  const page = normalizePositiveInteger(query.page, 1);
  const pageSize = Math.min(maxPageSize, normalizePositiveInteger(query.pageSize, 25));

  return {
    view,
    category,
    chain,
    search: String(query.search || '').trim(),
    sort,
    page,
    pageSize,
  };
}

function filterCoins(
  coins: CoinListItem[],
  query: ReturnType<typeof normalizeLeaderboardQuery>,
): CoinListItem[] {
  const search = query.search.toLowerCase();

  return coins.filter((coin) => {
    if (query.view === 'presales' && !isActivePresaleCandidate(coin)) return false;
    if (query.view === 'trending' && coin.trendingScore <= 0) return false;
    if (query.view === 'watched' && coin.watchCount <= 0) return false;
    if (query.view === 'recent' && !isLaunchedRecentlyCandidate(coin)) return false;
    if (query.category !== 'All' && coin.category !== query.category) return false;
    if (query.chain !== 'All chains' && coin.chain !== query.chain) return false;
    if (search && !`${coin.name} ${coin.symbol} ${coin.chain}`.toLowerCase().includes(search)) {
      return false;
    }

    return true;
  });
}

function sortLeaderboardCoins(
  coins: CoinListItem[],
  query: ReturnType<typeof normalizeLeaderboardQuery>,
) {
  if (isDefaultSort(query.sort)) {
    if (query.view === 'trending') return [...coins].sort(sortByTrendingScore);
    if (query.view === 'watched') return [...coins].sort(sortByWatchCount);
    if (query.view === 'recent') return [...coins].sort(sortByNewestLaunch);
    if (query.view === 'presales') return [...coins].sort(sortByPresaleEnd);
    return [...coins].sort(sortByVotes);
  }

  return [...coins].sort((a, b) => sortCoins(a, b, query.sort));
}

function normalizeView(value: string | null | undefined): LeaderboardView {
  if (value === 'trending' || value === 'presales' || value === 'watched' || value === 'recent') {
    return value;
  }
  return defaultView;
}

function normalizeCategory(value: string | null | undefined) {
  if (value && coinCategories.includes(value as (typeof coinCategories)[number])) return value;
  return 'All';
}

function normalizeChain(value: string | null | undefined) {
  if (value && coinChainOptions.includes(value)) return value;
  return 'All chains';
}

function normalizeSort(sort: string | null | undefined, direction: string | null | undefined) {
  const key = isCoinSortKey(sort) ? sort : defaultSort.key;
  const normalizedDirection: 'asc' | 'desc' = direction === 'asc' ? 'asc' : 'desc';
  return { key, direction: normalizedDirection };
}

function normalizePositiveInteger(value: string | number | null | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function isCoinSortKey(value: string | null | undefined): value is CoinSortKey {
  return (
    value === 'rank' ||
    value === 'name' ||
    value === 'capN' ||
    value === 'price' ||
    value === 'change' ||
    value === 'launch' ||
    value === 'boost' ||
    value === 'votes' ||
    value === 'age'
  );
}

function isDefaultSort(sort: { key: CoinSortKey; direction: 'asc' | 'desc' }) {
  return sort.key === defaultSort.key && sort.direction === defaultSort.direction;
}

function isLaunchedRecentlyCandidate(coin: CoinListItem) {
  const launchTime = dateValue(coin.launchTimestamp);
  return coin.lifecycle === 'launched' && launchTime > 0 && launchTime <= Date.now();
}

function isActivePresaleCandidate(coin: CoinListItem) {
  const endTime = dateValue(coin.presaleEndTimestamp);
  return coin.lifecycle === 'presale' && endTime > Date.now();
}

function sortByPresaleEnd(a: CoinListItem, b: CoinListItem) {
  const aDate = futureDateValue(a.presaleEndTimestamp);
  const bDate = futureDateValue(b.presaleEndTimestamp);
  return aDate - bDate || b.votes - a.votes || a.name.localeCompare(b.name);
}

function sortByWatchCount(a: CoinListItem, b: CoinListItem) {
  return b.watchCount - a.watchCount || b.votes - a.votes || a.name.localeCompare(b.name);
}

function sortByTrendingScore(a: CoinListItem, b: CoinListItem) {
  return b.trendingScore - a.trendingScore || b.votes - a.votes || a.name.localeCompare(b.name);
}

function sortByNewestLaunch(a: CoinListItem, b: CoinListItem) {
  return (
    dateValue(b.launchTimestamp) - dateValue(a.launchTimestamp) ||
    b.votes - a.votes ||
    a.name.localeCompare(b.name)
  );
}

function sortByVotes(a: CoinListItem, b: CoinListItem) {
  return b.votes - a.votes || a.name.localeCompare(b.name);
}

function sortCoins(
  a: CoinListItem,
  b: CoinListItem,
  sort: { key: CoinSortKey; direction: 'asc' | 'desc' },
) {
  const direction = sort.direction === 'desc' ? -1 : 1;
  let result = 0;

  if (sort.key === 'name') result = a.name.localeCompare(b.name);
  else if (sort.key === 'capN') result = a.capN - b.capN;
  else if (sort.key === 'price') result = moneyValue(a.price) - moneyValue(b.price);
  else if (sort.key === 'change') result = a.change - b.change;
  else if (sort.key === 'launch')
    result = dateValue(a.launchTimestamp) - dateValue(b.launchTimestamp);
  else if (sort.key === 'boost') result = (a.boost || 0) - (b.boost || 0);
  else if (sort.key === 'votes') result = a.votes - b.votes;
  else if (sort.key === 'age')
    result = dateValue(a.submittedTimestamp) - dateValue(b.submittedTimestamp);
  else result = a.rank - b.rank;

  return result * direction || a.name.localeCompare(b.name);
}

function moneyValue(value: string) {
  if (value === '—') return 0;
  const normalized = value.replace(/[$,]/g, '').trim().toUpperCase();
  const multiplier = normalized.endsWith('T')
    ? 1_000_000_000_000
    : normalized.endsWith('B')
      ? 1_000_000_000
      : normalized.endsWith('M')
        ? 1_000_000
        : normalized.endsWith('K')
          ? 1_000
          : 1;
  return Number.parseFloat(normalized) * multiplier || 0;
}

function futureDateValue(value: string | null | undefined) {
  const time = dateValue(value);
  if (!time || time < Date.now()) return Number.MAX_SAFE_INTEGER;
  return time;
}

function dateValue(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}
