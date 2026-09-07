import 'server-only';

import type { NetworkId } from '@/features/coins/types';
import { db } from '@/lib/db/client';
import {
  coinBoosts,
  coinPromotions,
  coinWatchlists,
  coins,
  marketSnapshots,
  marketSources,
} from '@/lib/db/schema';
import { withRedisLock } from '@/lib/cache/redis-lock';
import { recordMetric, timeAsync } from '@/lib/observability/metrics';
import { sql } from 'drizzle-orm';

type MarketSyncCoin = Pick<
  typeof coins.$inferSelect,
  'id' | 'chain' | 'contractAddress' | 'listingStatus'
> & {
  marketSourceExternalId?: string | null;
  marketSourceLastErrorCode?: string | null;
  marketSourceFailureCount?: number | null;
  marketSourceNextAttemptAt?: Date | string | null;
};

type MarketSnapshotRow = typeof marketSnapshots.$inferSelect;

type MarketTokenDetails = {
  priceUSD?: unknown;
  marketCapUSD?: unknown;
  marketCapDilutedUSD?: unknown;
  volume24hUSD?: unknown;
  priceChange24hPercentage?: unknown;
  liquidityUSD?: unknown;
  totalSupply?: unknown;
  holdersCount?: unknown;
  rank?: unknown;
};

type MarketFetchResult =
  | { ok: true; details: MarketTokenDetails }
  | {
      ok: false;
      code: 'invalid-address-format' | 'request-failed' | 'missing-data' | 'network-error';
      message: string;
    };

const mobulaProvider = 'mobula';
const geckoTerminalProvider = 'geckoterminal';
type MarketProvider = typeof mobulaProvider | typeof geckoTerminalProvider;

const mobulaChainIds: Partial<Record<NetworkId, string>> = {
  ethereum: 'evm:1',
  bsc: 'evm:56',
  polygon: 'evm:137',
  avalanche: 'evm:43114',
  arbitrum: 'evm:42161',
  base: 'evm:8453',
  optimism: 'evm:10',
  fantom: 'evm:250',
  kcc: 'evm:321',
  hood: 'evm:4663',
  solana: 'solana:solana',
  sui: 'sui:sui',
};

const geckoTerminalChainIds: Partial<Record<NetworkId, string>> = {
  tron: 'tron',
};

const evmNetworks = new Set<NetworkId>([
  'ethereum',
  'bsc',
  'polygon',
  'avalanche',
  'arbitrum',
  'base',
  'optimism',
  'fantom',
  'kcc',
  'hood',
]);

const base58AddressPattern = /^[1-9A-HJ-NP-Za-km-z]+$/;

const syncState = globalThis as typeof globalThis & {
  endorsecoinMobulaInFlight?: Promise<Map<number, MarketSnapshotRow>>;
  endorsecoinMobulaNextAllowedAt?: number;
  endorsecoinGeckoTerminalNextAllowedAt?: number;
  endorsecoinMobulaKeyIndex?: number;
};

const apiBaseUrl = process.env.MOBULA_API_BASE_URL || 'https://api.mobula.io';
const geckoTerminalApiBaseUrl =
  process.env.GECKOTERMINAL_API_BASE_URL || 'https://api.geckoterminal.com';
const requestTimeoutMs = Number(process.env.MOBULA_REQUEST_TIMEOUT_MS || 8_000);
const cacheSeconds = Number(
  process.env.MARKET_SYNC_CACHE_SECONDS || process.env.MARKET_DATA_CACHE_SECONDS || 900,
);
const defaultSyncLimit = Number(
  process.env.MARKET_SYNC_LIMIT || process.env.MARKET_DATA_SYNC_LIMIT || 7,
);
const maxSyncLimit = Number(
  process.env.MARKET_SYNC_MAX_LIMIT || process.env.MARKET_DATA_MAX_SYNC_LIMIT || 120,
);
const requestSpacingMs = Math.max(1_050, Number(process.env.MOBULA_REQUEST_SPACING_MS || 1_050));
const geckoTerminalRequestSpacingMs = Math.max(
  6_100,
  Number(process.env.GECKOTERMINAL_REQUEST_SPACING_MS || 6_100),
);
const maxSyncedPriceUsd = 1_000_000;
const maxSyncedMarketCapUsd = 1_000_000_000_000;
const maxSyncedFdvUsd = 1_000_000_000_000;
const syncLockTtlMs = Number(
  process.env.MARKET_SYNC_LOCK_TTL_MS || process.env.MOBULA_SYNC_LOCK_TTL_MS || 120_000,
);
const baseBackoffMs = Number(process.env.MARKET_SYNC_ERROR_BACKOFF_MS || 15 * 60 * 1000);
const maxBackoffMs = Number(process.env.MARKET_SYNC_MAX_ERROR_BACKOFF_MS || 12 * 60 * 60 * 1000);
const invalidAddressErrorCode = 'invalid-address-format';

// Log tag so these are easy to grep in server logs.
const LOG_TAG = '[mobula-sync]';

export async function refreshStaleMarketSnapshots(
  coinRows: MarketSyncCoin[],
  latestSnapshots: Map<number, MarketSnapshotRow>,
  priorityCoinId?: number,
  limit = defaultSyncLimit,
) {
  return timeAsync(
    'server.operation',
    { operation: 'market.refresh_stale', checked: coinRows.length },
    async () => {
      try {
        const staleCoins = coinRows
          .filter((coin) => shouldRefreshCoin(coin, latestSnapshots.get(coin.id)))
          .sort((a, b) => {
            if (!priorityCoinId) return 0;
            if (a.id === priorityCoinId) return -1;
            if (b.id === priorityCoinId) return 1;
            return 0;
          })
          .slice(0, Math.max(1, Math.min(maxSyncLimit, limit)));

        if (!staleCoins.length) {
          recordMetric('market.sync', { event: 'nothing_stale', checked: coinRows.length });
          console.log(
            `${LOG_TAG} nothing stale to refresh (checked ${coinRows.length} coins, all within ${cacheSeconds}s cache window or not eligible)`,
          );
          return new Map<number, MarketSnapshotRow>();
        }

        console.log(
          `${LOG_TAG} refreshing ${staleCoins.length} stale coin(s): ${staleCoins.map((c) => c.id).join(', ')}`,
        );

        recordMetric('market.sync', {
          event: 'stale_selected',
          checked: coinRows.length,
          stale: staleCoins.length,
        });
        return await runDedupeSync(() => syncCoinMarketData(staleCoins));
      } catch (error) {
        if (isMissingMarketSnapshotColumnError(error)) {
          recordMetric('market.sync', { event: 'missing_snapshot_column' });
          console.warn(`${LOG_TAG} market_snapshots column missing, skipping sync`, error);
          return new Map<number, MarketSnapshotRow>();
        }
        console.error(`${LOG_TAG} refreshStaleMarketSnapshots failed`, error);
        throw error;
      }
    },
  );
}

export async function syncMobulaMarketData(limit = defaultSyncLimit) {
  return timeAsync('server.operation', { operation: 'market.sync', limit }, async () => {
    const requestedLimit = Number.isFinite(limit) ? limit : defaultSyncLimit;
    const safeLimit = Math.max(1, Math.min(maxSyncLimit, requestedLimit));
    const coinRows = await selectStaleSyncCoins(safeLimit);

    const coinIds = coinRows.map((coin) => coin.id);
    if (!coinIds.length) {
      recordMetric('market.sync', { event: 'no_stale_candidates' });
      console.log(`${LOG_TAG} no stale active coins with supported chain/address found`);
      return { checked: 0, updated: 0 };
    }

    const snapshotRows = await selectLatestMarketSnapshots(coinIds);
    const latestByCoin = firstByCoinId(snapshotRows);
    const refreshed = await refreshStaleMarketSnapshots(
      coinRows,
      latestByCoin,
      undefined,
      safeLimit,
    );

    recordMetric('market.sync', {
      event: 'complete',
      checked: coinRows.length,
      updated: refreshed.size,
    });
    console.log(`${LOG_TAG} sync complete: checked ${coinRows.length}, updated ${refreshed.size}`);

    return { checked: coinRows.length, updated: refreshed.size };
  });
}

async function selectLatestMarketSnapshots(coinIds: number[]) {
  if (!coinIds.length) return [];
  const idSql = sql.join(
    coinIds.map((coinId) => sql`${coinId}`),
    sql`, `,
  );

  const rows = await db.execute<MarketSnapshotRow>(sql`
    select distinct on (${marketSnapshots.coinId})
      ${marketSnapshots.id},
      ${marketSnapshots.coinId} as "coinId",
      ${marketSnapshots.priceUsd} as "priceUsd",
      ${marketSnapshots.marketCapUsd} as "marketCapUsd",
      ${marketSnapshots.volume24hUsd} as "volume24hUsd",
      ${marketSnapshots.change24h} as "change24h",
      ${marketSnapshots.liquidityUsd} as "liquidityUsd",
      ${marketSnapshots.fdvUsd} as "fdvUsd",
      ${marketSnapshots.totalSupply} as "totalSupply",
      ${marketSnapshots.holdersCount} as "holdersCount",
      ${marketSnapshots.marketRank} as "marketRank",
      ${marketSnapshots.recordedAt} as "recordedAt"
    from ${marketSnapshots}
    where ${marketSnapshots.coinId} in (${idSql})
    order by ${marketSnapshots.coinId}, ${marketSnapshots.recordedAt} desc
  `);

  return Array.from(rows);
}

async function runDedupeSync(fetcher: () => Promise<Map<number, MarketSnapshotRow>>) {
  if (syncState.endorsecoinMobulaInFlight) {
    console.log(`${LOG_TAG} sync already in flight, reusing existing promise`);
    return syncState.endorsecoinMobulaInFlight;
  }

  syncState.endorsecoinMobulaInFlight = withMobulaSyncLock(fetcher).finally(() => {
    syncState.endorsecoinMobulaInFlight = undefined;
  });

  return syncState.endorsecoinMobulaInFlight;
}

async function withMobulaSyncLock(fetcher: () => Promise<Map<number, MarketSnapshotRow>>) {
  return withRedisLock(
    {
      key: 'lock:mobula-sync',
      ttlMs: syncLockTtlMs,
      onLocked: () => {
        console.log(`${LOG_TAG} sync already locked, skipping duplicate run`);
        return new Map<number, MarketSnapshotRow>();
      },
    },
    fetcher,
  );
}

async function syncCoinMarketData(coinRows: MarketSyncCoin[]) {
  const refreshed = new Map<number, MarketSnapshotRow>();

  for (const coin of coinRows) {
    const provider = getMarketProvider(coin.chain);
    const chainId = getProviderChainId(coin.chain);
    const address = coin.contractAddress?.trim();

    if (!chainId) {
      recordMetric('market.sync', { event: 'coin_skipped', reason: 'unsupported_chain' });
      console.warn(
        `${LOG_TAG} coin ${coin.id}: no Mobula chain mapping for chain "${coin.chain}", skipping`,
      );
      continue;
    }
    if (!address) {
      recordMetric('market.sync', { event: 'coin_skipped', reason: 'missing_address' });
      console.warn(`${LOG_TAG} coin ${coin.id}: missing contract address, skipping`);
      continue;
    }

    const externalId = marketSourceExternalId(chainId, address);
    if (hasKnownInvalidAddressError(coin, externalId)) {
      recordMetric('market.sync', { event: 'coin_skipped', reason: 'known_invalid_address' });
      console.warn(
        `${LOG_TAG} coin ${coin.id}: skipping known invalid Mobula address ${chainId}/${address}`,
      );
      continue;
    }
    if (!isValidAddressForChain(coin.chain, address)) {
      recordMetric('market.sync', { event: 'coin_skipped', reason: 'invalid_address_format' });
      await recordMarketSourceError(
        coin,
        provider,
        externalId,
        invalidAddressErrorCode,
        `Invalid address format for ${coin.chain || 'unknown'} chain.`,
      );
      console.warn(
        `${LOG_TAG} coin ${coin.id}: skipped locally invalid address ${chainId}/${address}`,
      );
      continue;
    }

    const result = await fetchTokenMarketDetails(provider, chainId, address);
    if (!result.ok) {
      recordMetric('market.sync', { event: 'coin_fetch_failed', reason: result.code });
      await recordMarketSourceError(coin, provider, externalId, result.code, result.message);
      console.warn(
        `${LOG_TAG} coin ${coin.id}: no data returned from ${provider} for ${chainId}/${address}`,
      );
      continue;
    }

    const details = result.details;
    const suspiciousReason = getSuspiciousMarketDetailsReason(details);
    if (suspiciousReason) {
      recordMetric('market.sync', { event: 'coin_skipped', reason: 'suspicious_market_data' });
      await recordMarketSourceError(
        coin,
        provider,
        externalId,
        'suspicious-market-data',
        suspiciousReason,
      );
      console.warn(
        `${LOG_TAG} coin ${coin.id}: skipped suspicious Mobula market data — ${suspiciousReason}`,
      );
      continue;
    }

    const [snapshot] = await db
      .insert(marketSnapshots)
      .values({
        coinId: coin.id,
        priceUsd: toDbNumber(details.priceUSD),
        marketCapUsd: toDbNumber(details.marketCapUSD),
        volume24hUsd: toDbNumber(details.volume24hUSD),
        change24h: toDbNumber(details.priceChange24hPercentage),
        liquidityUsd: toDbNumber(details.liquidityUSD),
        fdvUsd: toDbNumber(details.marketCapDilutedUSD),
        totalSupply: toDbNumber(details.totalSupply),
        holdersCount: toInteger(details.holdersCount),
        marketRank: toInteger(details.rank),
      })
      .returning();

    if (snapshot) {
      recordMetric('market.sync', { event: 'coin_updated' });
      await recordMarketSourceSuccess(coin.id, provider, externalId);
      refreshed.set(coin.id, snapshot);
      console.log(
        `${LOG_TAG} coin ${coin.id}: snapshot inserted (price=${snapshot.priceUsd ?? 'null'})`,
      );
    } else {
      console.warn(`${LOG_TAG} coin ${coin.id}: insert returned no row`);
    }
  }

  return refreshed;
}

async function fetchTokenMarketDetails(
  provider: MarketProvider,
  chainId: string,
  address: string,
): Promise<MarketFetchResult> {
  if (provider === geckoTerminalProvider) {
    return fetchGeckoTerminalTokenDetails(chainId, address);
  }

  return fetchMobulaTokenDetails(chainId, address);
}

async function fetchMobulaTokenDetails(
  chainId: string,
  address: string,
): Promise<MarketFetchResult> {
  const apiKey = getNextMobulaApiKey();
  if (!apiKey) {
    return {
      ok: false,
      code: 'request-failed',
      message: 'MOBULA_API_KEY or MOBULA_API_KEYS is not set.',
    };
  }

  await waitForMobulaSlot();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const url = new URL('/api/2/token/details', apiBaseUrl);
    url.searchParams.set('chainId', chainId);
    url.searchParams.set('address', address);

    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        Authorization: apiKey,
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn(
        `${LOG_TAG} Mobula request failed: ${response.status} ${response.statusText} for ${chainId}/${address} — ${body.slice(0, 300)}`,
      );
      if (isInvalidAddressFormatResponse(body)) {
        return {
          ok: false,
          code: invalidAddressErrorCode,
          message: cleanErrorMessage(body) || 'Invalid address format.',
        };
      }
      return {
        ok: false,
        code: 'request-failed',
        message: `${response.status} ${response.statusText}`,
      };
    }

    const payload = await response.json();
    if (!isRecord(payload?.data)) {
      console.warn(
        `${LOG_TAG} Mobula response missing "data" for ${chainId}/${address}: ${JSON.stringify(payload).slice(0, 300)}`,
      );
      return { ok: false, code: 'missing-data', message: 'Mobula response did not include data.' };
    }
    return { ok: true, details: payload.data as MarketTokenDetails };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    console.warn(
      `${LOG_TAG} Mobula request ${isAbort ? 'timed out' : 'threw'} for ${chainId}/${address}`,
      isAbort ? '' : error,
    );
    return {
      ok: false,
      code: 'network-error',
      message: isAbort ? 'Mobula request timed out.' : 'Mobula request failed.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGeckoTerminalTokenDetails(
  chainId: string,
  address: string,
): Promise<MarketFetchResult> {
  await waitForGeckoTerminalSlot();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const url = new URL(
      `/api/v2/networks/${encodeURIComponent(chainId)}/tokens/${encodeURIComponent(address)}`,
      geckoTerminalApiBaseUrl,
    );
    url.searchParams.set('include', 'top_pools');

    const response = await fetch(url, {
      headers: {
        accept: 'application/json;version=20230203',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn(
        `${LOG_TAG} GeckoTerminal request failed: ${response.status} ${response.statusText} for ${chainId}/${address} — ${body.slice(0, 300)}`,
      );
      return {
        ok: false,
        code: 'request-failed',
        message: `${response.status} ${response.statusText}`,
      };
    }

    const payload = await response.json();
    const attributes = isRecord(payload?.data?.attributes) ? payload.data.attributes : null;
    if (!attributes) {
      console.warn(
        `${LOG_TAG} GeckoTerminal response missing token attributes for ${chainId}/${address}: ${JSON.stringify(payload).slice(0, 300)}`,
      );
      return {
        ok: false,
        code: 'missing-data',
        message: 'GeckoTerminal response did not include token attributes.',
      };
    }

    return { ok: true, details: geckoTerminalAttributesToMarketDetails(attributes) };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    console.warn(
      `${LOG_TAG} GeckoTerminal request ${isAbort ? 'timed out' : 'threw'} for ${chainId}/${address}`,
      isAbort ? '' : error,
    );
    return {
      ok: false,
      code: 'network-error',
      message: isAbort ? 'GeckoTerminal request timed out.' : 'GeckoTerminal request failed.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function geckoTerminalAttributesToMarketDetails(
  attributes: Record<string, unknown>,
): MarketTokenDetails {
  const volumeUsd = isRecord(attributes.volume_usd) ? attributes.volume_usd : {};
  const priceChange = isRecord(attributes.price_change_percentage)
    ? attributes.price_change_percentage
    : {};

  return {
    priceUSD: attributes.price_usd,
    marketCapUSD: attributes.market_cap_usd,
    marketCapDilutedUSD: attributes.fdv_usd,
    volume24hUSD: volumeUsd.h24 ?? attributes.volume_usd,
    priceChange24hPercentage: priceChange.h24,
    liquidityUSD: attributes.total_reserve_in_usd,
  };
}

function shouldRefreshCoin(coin: MarketSyncCoin, snapshot: MarketSnapshotRow | undefined) {
  if (coin.listingStatus !== 'active') return false;
  if (!coin.contractAddress?.trim()) return false;
  const chainId = getProviderChainId(coin.chain);
  if (!chainId) return false;
  if (!isValidAddressForChain(coin.chain, coin.contractAddress.trim())) return false;
  if (hasActiveBackoff(coin)) return false;
  if (
    hasKnownInvalidAddressError(coin, marketSourceExternalId(chainId, coin.contractAddress.trim()))
  ) {
    return false;
  }
  if (!snapshot) return true;
  return Date.now() - snapshot.recordedAt.getTime() > cacheSeconds * 1_000;
}

function getMarketProvider(chain: string | null): MarketProvider {
  return chain === 'tron' ? geckoTerminalProvider : mobulaProvider;
}

function getProviderChainId(chain: string | null) {
  if (!chain) return '';
  const network = chain as NetworkId;
  return getMarketProvider(chain) === geckoTerminalProvider
    ? geckoTerminalChainIds[network] || ''
    : mobulaChainIds[network] || '';
}

async function selectStaleSyncCoins(limit: number): Promise<MarketSyncCoin[]> {
  const supportedChains = Object.keys({ ...mobulaChainIds, ...geckoTerminalChainIds });
  const nowIso = new Date().toISOString();
  const staleBeforeIso = new Date(Date.now() - cacheSeconds * 1_000).toISOString();
  const supportedChainSql = sql.join(
    supportedChains.map((chain) => sql`${chain}`),
    sql`, `,
  );

  return db.execute<MarketSyncCoin>(sql`
    select
      c.id,
      c.chain,
      c.contract_address as "contractAddress",
      c.listing_status as "listingStatus",
      source.external_id as "marketSourceExternalId",
      source.last_error_code as "marketSourceLastErrorCode",
      source.failure_count as "marketSourceFailureCount",
      source.next_attempt_at as "marketSourceNextAttemptAt"
    from ${coins} c
    left join ${marketSources} source
      on source.coin_id = c.id
     and source.provider = (
        case
          when c.chain = 'tron' then ${geckoTerminalProvider}
          else ${mobulaProvider}
        end
      )
    left join lateral (
      select ms.recorded_at
      from ${marketSnapshots} ms
      where ms.coin_id = c.id
      order by ms.recorded_at desc
      limit 1
    ) latest_snapshot on true
    left join lateral (
      select 1 as active
      from ${coinPromotions} promotion
      where promotion.coin_id = c.id
        and promotion.status in ('active', 'scheduled')
        and promotion.starts_at <= ${nowIso}::timestamptz
        and promotion.expires_at > ${nowIso}::timestamptz
      limit 1
    ) active_promotion on true
    left join lateral (
      select 1 as active
      from ${coinBoosts} boost
      where boost.coin_id = c.id
        and boost.status in ('active', 'scheduled')
        and boost.starts_at <= ${nowIso}::timestamptz
        and boost.expires_at > ${nowIso}::timestamptz
      limit 1
    ) active_boost on true
    left join lateral (
      select count(*)::int as count
      from ${coinWatchlists} watchlist
      where watchlist.coin_id = c.id
    ) watch_count on true
    where c.listing_status = 'active'
      and c.contract_address is not null
      and btrim(c.contract_address) <> ''
      and c.chain in (${supportedChainSql})
      and (
        source.next_attempt_at is null
        or source.next_attempt_at <= ${nowIso}::timestamptz
      )
      and not coalesce((
        source.last_error_code = ${invalidAddressErrorCode}
        and source.external_id = (
          case c.chain
            when 'ethereum' then 'evm:1:'
            when 'bsc' then 'evm:56:'
            when 'polygon' then 'evm:137:'
            when 'avalanche' then 'evm:43114:'
            when 'arbitrum' then 'evm:42161:'
            when 'base' then 'evm:8453:'
            when 'optimism' then 'evm:10:'
            when 'fantom' then 'evm:250:'
            when 'kcc' then 'evm:321:'
            when 'hood' then 'evm:4663:'
            when 'tron' then 'tron:'
            when 'solana' then 'solana:solana:'
            when 'sui' then 'sui:sui:'
            else ''
          end || btrim(c.contract_address)
        )
      ), false)
      and (
        latest_snapshot.recorded_at is null
        or latest_snapshot.recorded_at < ${staleBeforeIso}::timestamptz
      )
    order by
      case
        when active_promotion.active is not null then 0
        when active_boost.active is not null then 1
        when coalesce(watch_count.count, 0) > 0 then 2
        else 3
      end asc,
      coalesce(watch_count.count, 0) desc,
      latest_snapshot.recorded_at asc nulls first,
      c.id asc
    limit ${limit}
  `);
}

function isValidAddressForChain(chain: string | null, address: string) {
  const normalizedChain = chain as NetworkId | null;
  const trimmed = address.trim();

  if (!normalizedChain || !trimmed) return false;
  if (evmNetworks.has(normalizedChain)) return /^0x[\da-f]{40}$/i.test(trimmed);
  if (normalizedChain === 'solana') {
    return trimmed.length >= 32 && trimmed.length <= 44 && base58AddressPattern.test(trimmed);
  }
  if (normalizedChain === 'tron') return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed);
  if (normalizedChain === 'sui') return /^0x[\da-f]{64}$/i.test(trimmed);

  return true;
}

function hasKnownInvalidAddressError(coin: MarketSyncCoin, externalId: string) {
  return (
    coin.marketSourceLastErrorCode === invalidAddressErrorCode &&
    coin.marketSourceExternalId === externalId
  );
}

function hasActiveBackoff(coin: MarketSyncCoin) {
  const nextAttempt = readDate(coin.marketSourceNextAttemptAt);
  return Boolean(nextAttempt && nextAttempt.getTime() > Date.now());
}

function getErrorBackoffMs(failureCount: number) {
  const multiplier = 2 ** Math.max(0, Math.min(failureCount - 1, 6));
  return Math.max(baseBackoffMs, Math.min(maxBackoffMs, baseBackoffMs * multiplier));
}

function readDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function marketSourceExternalId(chainId: string, address: string) {
  return `${chainId}:${address.trim()}`;
}

function getNextMobulaApiKey() {
  const keys = getMobulaApiKeys();
  if (!keys.length) return '';

  const index = syncState.endorsecoinMobulaKeyIndex || 0;
  syncState.endorsecoinMobulaKeyIndex = (index + 1) % keys.length;

  return keys[index % keys.length];
}

function getMobulaApiKeys() {
  return uniqueStrings([
    ...splitEnvList(process.env.MOBULA_API_KEYS),
    ...splitEnvList(process.env.MOBULA_API_KEY),
  ]);
}

function splitEnvList(value: string | undefined) {
  return (value || '')
    .split(/[\n,]/)
    .map((key) => key.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

async function recordMarketSourceError(
  coin: MarketSyncCoin,
  provider: MarketProvider,
  externalId: string,
  code: string,
  message: string,
) {
  const now = new Date();
  const failureCount = Number(coin.marketSourceFailureCount || 0) + 1;
  const nextAttemptAt =
    code === invalidAddressErrorCode
      ? null
      : new Date(now.getTime() + getErrorBackoffMs(failureCount));

  await db
    .insert(marketSources)
    .values({
      coinId: coin.id,
      provider,
      externalId,
      lastErrorCode: code,
      lastErrorMessage: message.slice(0, 500),
      lastErrorAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [marketSources.coinId, marketSources.provider],
      set: {
        externalId,
        lastErrorCode: code,
        lastErrorMessage: message.slice(0, 500),
        lastErrorAt: now,
        failureCount,
        nextAttemptAt,
        updatedAt: now,
      },
    });
}

async function recordMarketSourceSuccess(
  coinId: number,
  provider: MarketProvider,
  externalId: string,
) {
  const now = new Date();

  await db
    .insert(marketSources)
    .values({
      coinId,
      provider,
      externalId,
      lastMarketSyncAt: now,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastErrorAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [marketSources.coinId, marketSources.provider],
      set: {
        externalId,
        lastMarketSyncAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastErrorAt: null,
        failureCount: 0,
        nextAttemptAt: null,
        updatedAt: now,
      },
    });
}

function isInvalidAddressFormatResponse(body: string) {
  return body.toLowerCase().includes('invalid address format');
}

function cleanErrorMessage(body: string) {
  if (!body.trim()) return '';

  try {
    const payload = JSON.parse(body);
    if (typeof payload?.error === 'string') return payload.error;
    if (typeof payload?.message === 'string') return payload.message;
    if (typeof payload?.error?.message === 'string') return payload.error.message;
  } catch {
    // Mobula can return text bodies; fall through to trimmed text.
  }

  return body.replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function waitForMobulaSlot() {
  await waitForProviderSlot('endorsecoinMobulaNextAllowedAt', requestSpacingMs);
}

async function waitForGeckoTerminalSlot() {
  await waitForProviderSlot('endorsecoinGeckoTerminalNextAllowedAt', geckoTerminalRequestSpacingMs);
}

async function waitForProviderSlot(
  key: 'endorsecoinMobulaNextAllowedAt' | 'endorsecoinGeckoTerminalNextAllowedAt',
  spacingMs: number,
) {
  const now = Date.now();
  const nextAllowedAt = syncState[key] || 0;
  const delay = Math.max(0, nextAllowedAt - now);

  syncState[key] = Math.max(now, nextAllowedAt) + spacingMs;
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

function firstByCoinId<T extends { coinId: number }>(rows: T[]) {
  const map = new Map<number, T>();
  rows.forEach((row) => {
    if (!map.has(row.coinId)) map.set(row.coinId, row);
  });
  return map;
}

function getSuspiciousMarketDetailsReason(details: MarketTokenDetails) {
  const price = readFiniteNumber(details.priceUSD);
  const marketCap = readFiniteNumber(details.marketCapUSD);
  const fdv = readFiniteNumber(details.marketCapDilutedUSD);
  const volume = readFiniteNumber(details.volume24hUSD);
  const rank = toInteger(details.rank);

  const hasThinOrUnrankedSignal = (volume === null || volume === 0) && rank === null;

  if (price !== null && price > maxSyncedPriceUsd && hasThinOrUnrankedSignal) {
    return `price ${price} is above sanity limit with no volume/rank signal`;
  }

  if (marketCap !== null && marketCap > maxSyncedMarketCapUsd && hasThinOrUnrankedSignal) {
    return `market cap ${marketCap} is above sanity limit with no volume/rank signal`;
  }

  if (fdv !== null && fdv > maxSyncedFdvUsd && hasThinOrUnrankedSignal) {
    return `FDV ${fdv} is above sanity limit with no volume/rank signal`;
  }

  return '';
}

function readFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toDbNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : null;
}

function toInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMissingMarketSnapshotColumnError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error.code === '42703') return true;
  return isMissingMarketSnapshotColumnError(error.cause);
}
