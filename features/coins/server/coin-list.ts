import 'server-only';

import { NETWORKS } from '@/features/coins/networks';
import { processExpiredCoinDeletionRequests } from '@/features/coins/server/delete-requests';
import { getCoinInteractionSummaries } from '@/features/coins/server/interactions';
import { processExpiredPresales } from '@/features/coins/server/presale-expiry';
import type {
  BoostMultiplier,
  Coin,
  CoinCategory,
  CoinProjectLink,
  DexConfig,
  NetworkId,
} from '@/features/coins/types';
import { toCoinListItem, type CoinListItem } from '@/features/coins/view';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';
import { db } from '@/lib/db/client';
import { timeAsync } from '@/lib/observability/metrics';
import {
  coinBoosts,
  coinLinks,
  coinPromotions,
  coins,
  coinSubmissions,
  marketSnapshots,
} from '@/lib/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

const boostMultipliers = [10, 30, 50, 100, 500] as const;
const syncMarketDataOnPageRead =
  process.env.MARKET_SYNC_ON_PAGE === 'true' || process.env.MARKET_DATA_SYNC_ON_PAGE === 'true';
const publicCoinListCacheSeconds = Number(process.env.PUBLIC_COIN_LIST_CACHE_SECONDS || 60);
const publicCoinDetailCacheSeconds = Number(process.env.PUBLIC_COIN_DETAIL_CACHE_SECONDS || 60);

type DbCoin = typeof coins.$inferSelect;
type DbMarketSnapshot = typeof marketSnapshots.$inferSelect;
type DbCoinBoost = typeof coinBoosts.$inferSelect;
type DbCoinPromotion = typeof coinPromotions.$inferSelect;
type DbCoinLink = typeof coinLinks.$inferSelect;
type DbCoinSubmission = typeof coinSubmissions.$inferSelect;
type DbCoinSubmissionPayload = Pick<DbCoinSubmission, 'coinId' | 'coinData'>;
type DexProvider = Extract<DexConfig, { available: true }>['provider'];
type InteractionSummary = NonNullable<
  Awaited<ReturnType<typeof getCoinInteractionSummaries>> extends Map<number, infer Summary>
    ? Summary
    : never
>;

export async function getPublicCoinListItems(userId?: string | null): Promise<CoinListItem[]> {
  return timeAsync(
    'server.operation',
    { operation: 'coins.public_list', authenticated: Boolean(userId) },
    async () => {
      const coinRecords = await getPublicCoinRecords();
      const personalizedRecords = userId
        ? await attachUserInteractionState(coinRecords, userId)
        : coinRecords;
      return personalizedRecords.map((coin, index) => toCoinListItem(coin, index));
    },
  );
}

export async function getPublicCoinListItemsByIds(
  coinIds: number[],
  userId?: string | null,
): Promise<CoinListItem[]> {
  return timeAsync(
    'server.operation',
    { operation: 'coins.public_ids', authenticated: Boolean(userId), count: coinIds.length },
    async () => {
      const uniqueIds = Array.from(new Set(coinIds));
      if (!uniqueIds.length) return [];

      await processExpiredPresales();
      await processExpiredCoinDeletionRequests();

      const coinRecords = await readPublicCoinRecords(undefined, userId, undefined, uniqueIds);
      const coinsById = new Map(coinRecords.map((coin) => [coin.id, coin]));

      return uniqueIds.flatMap((coinId, index) => {
        const coin = coinsById.get(coinId);
        return coin ? [toCoinListItem(coin, index)] : [];
      });
    },
  );
}

export async function getPublicCoinById(id: number, userId?: string | null): Promise<Coin | null> {
  return timeAsync(
    'server.operation',
    { operation: 'coins.public_detail', authenticated: Boolean(userId) },
    async () => {
      const coinRecords = await getPublicCoinRecords(undefined, undefined, id);
      const rankedRecords = rankCoinsByBoostedVotes(coinRecords);
      const activeCoin = rankedRecords.find((coin) => coin.id === id);
      if (activeCoin)
        return userId ? attachSingleUserInteractionState(activeCoin, userId) : activeCoin;

      const suspendedRecords = await getPublicCoinRecords(id, undefined, id);
      return suspendedRecords.find((coin) => coin.id === id) || null;
    },
  );
}

async function getPublicCoinRecords(
  coinId?: number,
  userId?: string | null,
  priorityCoinId?: number,
): Promise<Coin[]> {
  await processExpiredPresales();
  await processExpiredCoinDeletionRequests();

  if (!coinId && !userId) {
    const version = await getCacheVersion('public-coins');
    return rememberJson(
      `coins:public:list:${version}:v1`,
      { ttlSeconds: publicCoinListCacheSeconds },
      () => readPublicCoinRecords(undefined, undefined, priorityCoinId),
    );
  }

  if (coinId && !userId) {
    const version = await getCacheVersion('public-coins');
    return rememberJson(
      `coins:public:detail:${version}:${coinId}:v1`,
      { ttlSeconds: publicCoinDetailCacheSeconds },
      () => readPublicCoinRecords(coinId, undefined, priorityCoinId),
    );
  }

  return readPublicCoinRecords(coinId, userId, priorityCoinId);
}

async function readPublicCoinRecords(
  coinId?: number,
  userId?: string | null,
  priorityCoinId?: number,
  requestedCoinIds?: number[],
): Promise<Coin[]> {
  return timeAsync(
    'db.operation',
    {
      operation: 'coins.public_records',
      mode: requestedCoinIds?.length ? 'ids' : coinId ? 'detail' : 'list',
      count: requestedCoinIds?.length || 0,
      authenticated: Boolean(userId),
    },
    () => selectPublicCoinRecords(coinId, userId, priorityCoinId, requestedCoinIds),
  );
}

async function selectPublicCoinRecords(
  coinId?: number,
  userId?: string | null,
  priorityCoinId?: number,
  requestedCoinIds?: number[],
): Promise<Coin[]> {
  const now = new Date();
  const nowIso = now.toISOString();
  const targetCoinIds = requestedCoinIds?.length ? Array.from(new Set(requestedCoinIds)) : null;
  const coinRows = await db
    .select()
    .from(coins)
    .where(
      targetCoinIds
        ? inArray(coins.id, targetCoinIds)
        : coinId
          ? eq(coins.id, coinId)
          : eq(coins.listingStatus, 'active'),
    )
    .orderBy(desc(coins.submittedAt))
    .limit(coinId ? 1 : targetCoinIds ? targetCoinIds.length : 500);

  if (!coinRows.length) return [];

  const hydratedCoinIds = coinRows.map((coin) => coin.id);
  const [snapshotRows, boostRows, promotionRows, linkRows, submissionRows] = await Promise.all([
    selectLatestMarketSnapshots(hydratedCoinIds),
    db
      .select()
      .from(coinBoosts)
      .where(
        and(
          inArray(coinBoosts.coinId, hydratedCoinIds),
          sql`${coinBoosts.status} in ('active', 'scheduled')`,
          sql`${coinBoosts.startsAt} <= ${nowIso}::timestamptz`,
          sql`${coinBoosts.expiresAt} > ${nowIso}::timestamptz`,
        ),
      )
      .orderBy(desc(coinBoosts.expiresAt)),
    db
      .select()
      .from(coinPromotions)
      .where(
        and(
          inArray(coinPromotions.coinId, hydratedCoinIds),
          sql`${coinPromotions.status} in ('active', 'scheduled')`,
          sql`${coinPromotions.startsAt} <= ${nowIso}::timestamptz`,
          sql`${coinPromotions.expiresAt} > ${nowIso}::timestamptz`,
        ),
      )
      .orderBy(desc(coinPromotions.expiresAt)),
    db.select().from(coinLinks).where(inArray(coinLinks.coinId, hydratedCoinIds)),
    selectLatestSubmissionPayloads(hydratedCoinIds),
  ]);

  const snapshotByCoin = firstByCoinId(snapshotRows);
  if (syncMarketDataOnPageRead) {
    const { refreshStaleMarketSnapshots } = await import('@/features/coins/server/market-sync');
    const refreshedSnapshots = await refreshStaleMarketSnapshots(
      coinRows,
      snapshotByCoin,
      priorityCoinId,
    );
    refreshedSnapshots.forEach((snapshot, coinId) => snapshotByCoin.set(coinId, snapshot));
  }
  const boostByCoin = firstByCoinId(boostRows);
  const promotionByCoin = firstByCoinId(promotionRows);
  const linksByCoin = groupLinksByCoinId(linkRows);
  const submissionByCoin = firstByCoinId(submissionRows.filter(hasLinkedCoinId));
  const interactionsByCoin = await getCoinInteractionSummaries(hydratedCoinIds, userId);

  return coinRows.map((coin, index) =>
    mapDbCoinToCoin({
      coin,
      index,
      snapshot: snapshotByCoin.get(coin.id) || null,
      boost: boostByCoin.get(coin.id) || null,
      promotion: promotionByCoin.get(coin.id) || null,
      links: linksByCoin.get(coin.id) || new Map(),
      submission: submissionByCoin.get(coin.id) || null,
      interactions: interactionsByCoin.get(coin.id) || null,
    }),
  );
}

async function attachUserInteractionState(coinRecords: Coin[], userId: string) {
  if (!coinRecords.length) return coinRecords;

  const interactionsByCoin = await getCoinInteractionSummaries(
    coinRecords.map((coin) => coin.id),
    userId,
  );

  return coinRecords.map((coin) => withInteractionState(coin, interactionsByCoin.get(coin.id)));
}

async function attachSingleUserInteractionState(coin: Coin, userId: string) {
  const [personalizedCoin] = await attachUserInteractionState([coin], userId);
  return personalizedCoin || coin;
}

function withInteractionState(coin: Coin, interactions: InteractionSummary | null | undefined) {
  if (!interactions) return coin;

  return {
    ...coin,
    community: {
      ...coin.community,
      userHasVoted: interactions.userHasVoted,
      nextVoteAt: interactions.nextVoteAt,
      userWatching: interactions.userWatching,
    },
  };
}

function mapDbCoinToCoin({
  coin,
  index,
  snapshot,
  boost,
  promotion,
  links,
  submission,
  interactions,
}: {
  coin: DbCoin;
  index: number;
  snapshot: DbMarketSnapshot | null;
  boost: DbCoinBoost | null;
  promotion: DbCoinPromotion | null;
  links: Map<string, DbCoinLink>;
  submission: DbCoinSubmissionPayload | null;
  interactions: InteractionSummary | null;
}): Coin {
  const network = toNetworkId(coin.chain);
  const dexLink = links.get('dex');
  const presale = readPresaleDetails(submission?.coinData);

  return {
    id: coin.id,
    externalId: `endorsecoin-db-${coin.id}`,
    name: coin.name,
    symbol: coin.symbol,
    slug: coin.slug,
    assetType: 'token',
    lifecycle: coin.isPresale ? 'presale' : 'launched',
    listingStatus: coin.listingStatus,
    network,
    contractAddress: coin.contractAddress || '',
    logoUrl: coin.logoUrl,
    description: coin.description,
    category: toCoinCategory(coin.category),
    launchDate: coin.launchDate ? coin.launchDate.toISOString() : null,
    presaleStartDate: presale.startDate,
    presaleEndDate: presale.endDate,
    submittedAt: coin.submittedAt.toISOString(),
    populatedAt: coin.updatedAt.toISOString(),
    chart: buildChartConfig(links, submission, network, coin.contractAddress || ''),
    dex: buildDexConfig(dexLink, submission, network, coin.contractAddress || ''),
    links: buildProjectLinks(links),
    security: {
      kycUrl: links.get('kyc')?.url || null,
      auditUrl: links.get('audit')?.url || null,
    },
    presale: {
      ...presale,
      websiteUrl: links.get('presale-website')?.url || presale.websiteUrl,
    },
    boost:
      boost && isBoostMultiplier(boost.multiplier)
        ? {
            active: true,
            multiplier: boost.multiplier,
            startsAt: boost.startsAt.toISOString(),
            endsAt: boost.expiresAt.toISOString(),
          }
        : { active: false },
    promoted: promotion
      ? {
          active: true,
          startsAt: promotion.startsAt.toISOString(),
          endsAt: promotion.expiresAt.toISOString(),
          placement: 'promoted-table',
          priority: promotion.priority,
        }
      : { active: false },
    market: {
      priceUsd: toNumber(snapshot?.priceUsd),
      marketCapUsd: toNumber(snapshot?.marketCapUsd),
      volume24hUsd: toNumber(snapshot?.volume24hUsd),
      change24h: toNumber(snapshot?.change24h),
      liquidityUsd: toNumber(snapshot?.liquidityUsd),
      fdvUsd: toNumber(snapshot?.fdvUsd),
      totalSupply: toNumber(snapshot?.totalSupply),
      holdersCount: snapshot?.holdersCount ?? null,
      marketRank: index + 1,
      lastUpdatedAt: snapshot?.recordedAt.toISOString() ?? null,
    },
    community: {
      weeklyVotes: interactions?.weeklyVotes || 0,
      totalVotes: interactions?.totalVotes || 0,
      recentVotes: interactions?.recentVotes || 0,
      recentWatchlistAdds: interactions?.recentWatchlistAdds || 0,
      trendingScore: interactions?.trendingScore || 0,
      watchlistCount: interactions?.watchlistCount || 0,
      userHasVoted: interactions?.userHasVoted || false,
      nextVoteAt: interactions?.nextVoteAt || null,
      userWatching: interactions?.userWatching || false,
    },
  };
}

function firstByCoinId<T extends { coinId: number }>(rows: T[]) {
  const map = new Map<number, T>();
  rows.forEach((row) => {
    if (!map.has(row.coinId)) map.set(row.coinId, row);
  });
  return map;
}

function hasLinkedCoinId(
  row: DbCoinSubmissionPayload,
): row is DbCoinSubmissionPayload & { coinId: number } {
  return typeof row.coinId === 'number';
}

function buildProjectLinks(links: Map<string, DbCoinLink>): CoinProjectLink[] {
  const publicTypes: CoinProjectLink['type'][] = [
    'website',
    'telegram',
    'x',
    'discord',
    'github',
    'whitepaper',
  ];

  return publicTypes.flatMap((type) => {
    const link = links.get(type);
    return link?.url ? [{ type, url: link.url }] : [];
  });
}

function readPresaleDetails(value: unknown) {
  if (!isRecord(value)) return emptyPresaleDetails();
  const market = isRecord(value.market) ? value.market : {};
  const presale = isRecord(market.presale) ? market.presale : {};

  return {
    websiteUrl: null,
    startDate: readString(presale.startDate) || null,
    endDate: readString(presale.endDate) || null,
    paymentToken: readString(presale.paymentToken) || null,
    softCap: readString(presale.softCap) || null,
    hardCap: readString(presale.hardCap) || null,
  };
}

function emptyPresaleDetails() {
  return {
    websiteUrl: null,
    startDate: null,
    endDate: null,
    paymentToken: null,
    softCap: null,
    hardCap: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function groupLinksByCoinId(rows: DbCoinLink[]) {
  const map = new Map<number, Map<string, DbCoinLink>>();
  rows.forEach((row) => {
    const links = map.get(row.coinId) || new Map<string, DbCoinLink>();
    links.set(row.type, row);
    map.set(row.coinId, links);
  });
  return map;
}

async function selectLatestMarketSnapshots(coinIds: number[]): Promise<DbMarketSnapshot[]> {
  return db
    .selectDistinctOn([marketSnapshots.coinId])
    .from(marketSnapshots)
    .where(inArray(marketSnapshots.coinId, coinIds))
    .orderBy(marketSnapshots.coinId, desc(marketSnapshots.recordedAt))
    .catch((error) => {
      if (!isMissingMarketSnapshotColumnError(error)) throw error;
      return db
        .selectDistinctOn([marketSnapshots.coinId], {
          id: marketSnapshots.id,
          coinId: marketSnapshots.coinId,
          priceUsd: marketSnapshots.priceUsd,
          marketCapUsd: marketSnapshots.marketCapUsd,
          volume24hUsd: marketSnapshots.volume24hUsd,
          change24h: marketSnapshots.change24h,
          liquidityUsd: sql<null>`null`,
          fdvUsd: sql<null>`null`,
          totalSupply: sql<null>`null`,
          holdersCount: sql<null>`null`,
          marketRank: marketSnapshots.marketRank,
          recordedAt: marketSnapshots.recordedAt,
        })
        .from(marketSnapshots)
        .where(inArray(marketSnapshots.coinId, coinIds))
        .orderBy(marketSnapshots.coinId, desc(marketSnapshots.recordedAt));
    });
}

async function selectLatestSubmissionPayloads(
  coinIds: number[],
): Promise<DbCoinSubmissionPayload[]> {
  return db
    .selectDistinctOn([coinSubmissions.coinId], {
      coinId: coinSubmissions.coinId,
      coinData: coinSubmissions.coinData,
    })
    .from(coinSubmissions)
    .where(
      and(inArray(coinSubmissions.coinId, coinIds), eq(coinSubmissions.submissionType, 'new-coin')),
    )
    .orderBy(coinSubmissions.coinId, desc(coinSubmissions.createdAt));
}

function isMissingMarketSnapshotColumnError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error.code === '42703') return true;
  return isMissingMarketSnapshotColumnError(error.cause);
}

function buildChartConfig(
  links: Map<string, DbCoinLink>,
  submission: DbCoinSubmissionPayload | null,
  network: NetworkId,
  contractAddress: string,
): Coin['chart'] {
  const chart = links.get('chart');

  // Submitted coins pick a provider via dropdown (chart.provider in the
  // submission data). Imported coins (Mobula import script) have no
  // submission row, so we fall back to guessing the provider from the
  // stored chart URL's hostname. This is what makes imported DexScreener
  // (and now CoinBrain) links render as an embed instead of always
  // showing "Custom chart link".
  const submissionProvider = readSubmissionChartProvider(submission?.coinData);
  const provider = submissionProvider || inferChartProviderFromUrl(chart?.url);

  if (provider && isEmbeddableChartProvider(provider)) {
    const chartUrl = buildChartEmbedUrl(provider, network, contractAddress);
    if (chartUrl) return { source: 'embed', provider, url: chartUrl };
  }

  if (chart?.url) return { source: 'external', url: chart.url };
  return { source: 'unavailable' };
}

// Infer chart provider from the URL's hostname when there's no submission
// to tell us explicitly. Used for imported coins only.
function inferChartProviderFromUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.includes('dexscreener.com')) return 'dexscreener';
  if (url.includes('geckoterminal.com')) return 'geckoterminal';
  if (url.includes('dextools.io')) return 'dextools';
  if (url.includes('coinbrain.com')) return 'coinbrain';
  return '';
}

function readSubmissionChartProvider(value: unknown) {
  if (!isRecord(value)) return '';
  const market = isRecord(value.market) ? value.market : {};
  const chart = isRecord(market.chart) ? market.chart : {};
  return typeof chart.provider === 'string' ? chart.provider.trim() : '';
}

function buildChartEmbedUrl(provider: string, network: NetworkId, address: string) {
  if (!address) return '';
  const encodedAddress = encodeURIComponent(address);

  if (provider === 'dexscreener') {
    const chain = dexscreenerChainIds[network];
    return chain
      ? `https://dexscreener.com/${chain}/${encodedAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=15`
      : '';
  }

  if (provider === 'geckoterminal') {
    const chain = geckoTerminalChainIds[network];
    return chain
      ? `https://www.geckoterminal.com/${chain}/pools/${encodedAddress}?embed=1&info=0&swaps=0`
      : '';
  }

  if (provider === 'dextools') {
    const chain = dextoolsChainIds[network];
    return chain
      ? `https://www.dextools.io/widget-chart/en/${chain}/pe-light/${encodedAddress}?theme=dark&chartType=1&chartResolution=30&drawingToolbars=false&chartInUsd=true`
      : '';
  }

  if (provider === 'coinbrain') {
    // CoinBrain's docs only list these 8 chains — notably no Solana.
    // Format: https://coinbrain.com/embed/<chain>-<pairAddress>?...
    // Note: like DEXTools above, this technically wants a pool/pair address,
    // not a bare token contract address — we only have the latter here.
    const chain = coinbrainChainIds[network];
    return chain
      ? `https://coinbrain.com/embed/${chain}-${encodedAddress}?theme=dark&chart=1&trades=1`
      : '';
  }

  return '';
}

function isEmbeddableChartProvider(
  provider: string,
): provider is 'dexscreener' | 'geckoterminal' | 'dextools' | 'coinbrain' {
  return (
    provider === 'dexscreener' ||
    provider === 'geckoterminal' ||
    provider === 'dextools' ||
    provider === 'coinbrain'
  );
}

const dexscreenerChainIds: Partial<Record<NetworkId, string>> = {
  ethereum: 'ethereum',
  bsc: 'bsc',
  solana: 'solana',
  polygon: 'polygon',
  avalanche: 'avalanche',
  arbitrum: 'arbitrum',
  base: 'base',
  optimism: 'optimism',
  dogecoin: 'dogechain',
  tron: 'tron',
  fantom: 'fantom',
  kcc: 'kcc',
  sui: 'sui',
  hood: 'robinhood',
  xrpl: 'xrpl',
};

const geckoTerminalChainIds: Partial<Record<NetworkId, string>> = {
  ethereum: 'eth',
  bsc: 'bsc',
  solana: 'solana',
  polygon: 'polygon_pos',
  avalanche: 'avax',
  arbitrum: 'arbitrum',
  base: 'base',
  optimism: 'optimism',
  fantom: 'ftm',
  kcc: 'kcc',
  sui: 'sui-network',
};

const dextoolsChainIds: Partial<Record<NetworkId, string>> = {
  ethereum: 'ether',
  bsc: 'bnb',
  solana: 'solana',
  polygon: 'polygon',
  avalanche: 'avalanche',
  arbitrum: 'arbitrum',
  base: 'base',
  optimism: 'optimism',
  tron: 'tron',
  sui: 'sui',
  hood: 'robinhood',
  xrpl: 'xrpl',
};

const coinbrainChainIds: Partial<Record<NetworkId, string>> = {
  ethereum: 'eth',
  bsc: 'bnb',
  polygon: 'poly',
  optimism: 'opti',
  avalanche: 'aval',
  arbitrum: 'arbi',
  fantom: 'fant',
};

function buildDexConfig(
  dexLink: DbCoinLink | undefined,
  submission: DbCoinSubmissionPayload | null,
  network: NetworkId,
  contractAddress: string,
): DexConfig {
  // Submitted coins: unchanged from original — always trust the submission's
  // chosen provider (including a genuine 'custom' choice) when one exists.
  if (submission) {
    const provider = readSubmissionDexProvider(submission.coinData);
    if (dexLink?.url) return { available: true, provider, url: dexLink.url };
    return buildDefaultDexConfig(network, contractAddress);
  }

  // Imported coins (no submission row): infer provider from chain, since
  // readSubmissionDexProvider would otherwise default to 'custom' for these.
  if (dexLink?.url) {
    return { available: true, provider: inferDexProviderFromNetwork(network), url: dexLink.url };
  }
  return buildDefaultDexConfig(network, contractAddress);
}

function buildDefaultDexConfig(network: NetworkId, contractAddress: string): DexConfig {
  const url = buildDefaultDexUrl(network, contractAddress);
  if (!url) return { available: false };

  return {
    available: true,
    provider: inferDexProviderFromNetwork(network),
    url,
  };
}

function buildDefaultDexUrl(network: NetworkId, contractAddress: string) {
  if (!contractAddress) return '';

  if (network === 'solana') {
    return `https://raydium.io/swap/?inputMint=sol&outputMint=${encodeURIComponent(contractAddress)}`;
  }

  if (network === 'ethereum') {
    return `https://app.uniswap.org/swap?outputCurrency=${encodeURIComponent(contractAddress)}&chain=mainnet`;
  }

  if (network === 'arbitrum') {
    return `https://app.uniswap.org/swap?outputCurrency=${encodeURIComponent(contractAddress)}&chain=arbitrum`;
  }

  if (network === 'base') {
    return `https://app.uniswap.org/swap?outputCurrency=${encodeURIComponent(contractAddress)}&chain=base`;
  }

  if (network === 'hood') {
    return `https://app.uniswap.org/swap?outputCurrency=${encodeURIComponent(contractAddress)}`;
  }

  if (network === 'bsc') {
    return `https://pancakeswap.finance/swap?outputCurrency=${encodeURIComponent(contractAddress)}`;
  }

  if (network === 'polygon') {
    return `https://dapp.quickswap.exchange/swap?type=best&to=${encodeURIComponent(contractAddress)}`;
  }

  if (network === 'kcc') {
    return `https://app.mojitoswap.finance/swap?outputCurrency=${encodeURIComponent(contractAddress)}`;
  }

  if (network === 'sui') {
    return `https://app.cetus.zone/swap?to=${encodeURIComponent(contractAddress)}`;
  }

  return '';
}

// Default DEX per chain, mirrored from the import script's DEX_SWAP_URL_BUILDERS.
// Only used for imported coins, which have no submission to read a provider from.
function inferDexProviderFromNetwork(network: NetworkId): DexProvider {
  if (network === 'ethereum' || network === 'arbitrum' || network === 'base' || network === 'hood')
    return 'uniswap';
  if (network === 'bsc') return 'pancakeswap';
  if (network === 'solana') return 'raydium';
  if (network === 'polygon') return 'quickswap';
  if (network === 'kcc') return 'mojitoswap';
  if (network === 'sui') return 'cetus';
  return 'custom';
}

function readSubmissionDexProvider(value: unknown): DexProvider {
  if (!isRecord(value)) return 'custom';
  const market = isRecord(value.market) ? value.market : {};
  const dex = isRecord(market.dex) ? market.dex : {};
  const provider = typeof dex.provider === 'string' ? dex.provider.trim() : '';
  if (
    provider === 'uniswap' ||
    provider === 'pancakeswap' ||
    provider === 'raydium' ||
    provider === 'quickswap' ||
    provider === 'mojitoswap' ||
    provider === 'cetus' ||
    provider === 'custom'
  ) {
    return provider;
  }
  return 'custom';
}

function toNetworkId(value: string | null): NetworkId {
  if (value && value in NETWORKS) return value as NetworkId;
  return 'other';
}

function toCoinCategory(value: string): CoinCategory {
  const categories: CoinCategory[] = [
    'AI',
    'DeFi',
    'Fan Token',
    'Gambling',
    'Gaming',
    'Memecoins',
    'NFT Platform',
    'Other',
    'Play To Earn',
    'Pump.fun Tokens',
    'Utility Token',
  ];
  return categories.includes(value as CoinCategory) ? (value as CoinCategory) : 'Other';
}

function isBoostMultiplier(value: number): value is BoostMultiplier {
  return boostMultipliers.includes(value as BoostMultiplier);
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rankCoinsByBoostedVotes(coinRecords: Coin[]) {
  return [...coinRecords]
    .sort(
      (a, b) =>
        boostedWeeklyVotes(b) - boostedWeeklyVotes(a) ||
        a.name.localeCompare(b.name) ||
        a.id - b.id,
    )
    .map((coin, index) => ({
      ...coin,
      market: {
        ...coin.market,
        marketRank: index + 1,
      },
    }));
}

function boostedWeeklyVotes(coin: Coin) {
  const boostPackage = coin.boost.active ? coin.boost.multiplier : null;
  return coin.community.weeklyVotes * getBoostVoteFactor(boostPackage);
}

function getBoostVoteFactor(boostPackage: number | null | undefined) {
  if (boostPackage === 10 || boostPackage === 30) return 2;
  if (boostPackage === 50 || boostPackage === 100) return 3;
  if (boostPackage === 500) return 5;
  return 1;
}
