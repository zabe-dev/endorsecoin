#!/usr/bin/env node

/**
 * Backfills existing TRON coins with GeckoTerminal profile data.
 *
 * Usage:
 *   npm run backfill:tron
 *   npm run backfill:tron -- --limit=25
 *   npm run backfill:tron -- --dry-run --debug
 *
 * This updates existing rows only. It does not create coins.
 */

import { createHash, createHmac, randomUUID } from 'crypto';
import postgres from 'postgres';

const args = process.argv.slice(2);
const DATABASE_URL = process.env.DATABASE_URL;
const DRY_RUN = args.includes('--dry-run');
const DEBUG = args.includes('--debug');
const LIMIT = readPositiveInteger(
  args.find((arg) => arg.startsWith('--limit='))?.split('=')[1],
  25,
);
const GECKOTERMINAL_API_BASE_URL = trimTrailingSlash(
  process.env.GECKOTERMINAL_API_BASE_URL || 'https://api.geckoterminal.com',
);
const GECKOTERMINAL_REQUEST_SPACING_MS = Math.max(
  6100,
  readPositiveInteger(process.env.GECKOTERMINAL_REQUEST_SPACING_MS, 6100),
);
const R2_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const LOG_TAG = '[tron-backfill]';
let nextGeckoTerminalRequestAt = 0;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

const db = postgres(DATABASE_URL, {
  max: 1,
  transform: postgres.camel,
});

try {
  await main();
} finally {
  await db.end();
}

async function main() {
  const coins = await loadTronCoins();
  console.log(`${LOG_TAG} Found ${coins.length} TRON coin(s) to check.`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const coin of coins) {
    try {
      const info = await fetchGeckoTerminalTokenInfo(coin.contractAddress);
      if (!info) {
        skipped += 1;
        continue;
      }

      const patch = await buildCoinPatch(coin, info);
      const holdersCount = pickInteger(info.holders || {}, ['count']);
      const sourceImageUrl = pickGeckoTerminalImageUrl(info);

      if (!Object.keys(patch.coin).length && !Object.keys(patch.links).length && !holdersCount) {
        console.log(`${LOG_TAG} ${coin.id} ${coin.symbol}: no new profile data.`);
        skipped += 1;
        continue;
      }

      if (DRY_RUN) {
        console.log(`${LOG_TAG} DRY RUN ${coin.id} ${coin.symbol}:`, {
          coin: patch.coin,
          links: patch.links,
          holdersCount,
          sourceImageUrl,
        });
        updated += 1;
        continue;
      }

      await applyBackfill(coin, patch, holdersCount, sourceImageUrl);
      console.log(`${LOG_TAG} ${coin.id} ${coin.symbol}: updated.`);
      updated += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        `${LOG_TAG} ${coin.id} ${coin.symbol}: failed — ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      if (DEBUG) console.warn(error);
    }
  }

  console.log(`${LOG_TAG} Done. updated=${updated}, skipped=${skipped}, failed=${failed}`);
}

async function loadTronCoins() {
  return db`
    select
      c.id,
      c.name,
      c.symbol,
      c.logo_url,
      c.description,
      c.contract_address,
      latest.price_usd,
      latest.market_cap_usd,
      latest.volume_24h_usd,
      latest.change_24h,
      latest.liquidity_usd,
      latest.fdv_usd,
      latest.total_supply,
      latest.market_rank,
      latest.holders_count
    from coins c
    left join lateral (
      select *
      from market_snapshots ms
      where ms.coin_id = c.id
      order by ms.recorded_at desc
      limit 1
    ) latest on true
    where c.chain = 'tron'
      and c.listing_status = 'active'
      and c.contract_address is not null
      and btrim(c.contract_address) <> ''
    order by
      case when latest.holders_count is null then 0 else 1 end asc,
      c.updated_at asc
    limit ${LIMIT}
  `;
}

async function fetchGeckoTerminalTokenInfo(address) {
  await waitForGeckoTerminalSlot();

  const url = new URL(
    `/api/v2/networks/tron/tokens/${encodeURIComponent(address)}/info`,
    GECKOTERMINAL_API_BASE_URL,
  );

  const response = await fetch(url, {
    headers: { accept: 'application/json;version=20230203' },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.warn(
      `${LOG_TAG} GeckoTerminal info failed for ${address}: ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`,
    );
    return null;
  }

  const json = await response.json();
  const attributes = json?.data?.attributes;
  return attributes && typeof attributes === 'object' ? attributes : null;
}

async function buildCoinPatch(coin, info) {
  const coinPatch = {};
  const linksPatch = extractGeckoTerminalProjectLinks(info);
  const nextDescription = sanitizePlainText(pickString(info, ['description']));
  const sourceLogoUrl = pickGeckoTerminalImageUrl(info);

  if (!coin.description && nextDescription) coinPatch.description = nextDescription;

  if (sourceLogoUrl && shouldReplaceLogo(coin.logoUrl)) {
    coinPatch.logoUrl = await resolveLogoUrl(sourceLogoUrl, coin.contractAddress);
  }

  return { coin: coinPatch, links: linksPatch };
}

function shouldReplaceLogo(currentLogoUrl) {
  if (!currentLogoUrl) return true;
  return !String(currentLogoUrl).includes('assets.endorsecoin.com');
}

async function resolveLogoUrl(sourceLogoUrl, contractAddress) {
  try {
    const uploaded = await mirrorRemoteImageToR2(sourceLogoUrl, { contractAddress });
    return uploaded.url;
  } catch (error) {
    console.warn(
      `${LOG_TAG} Could not mirror TRON logo to R2; keeping existing logo. ${
        error instanceof Error ? error.message : ''
      }`,
    );
    return '';
  }
}

async function applyBackfill(coin, patch, holdersCount, sourceImageUrl) {
  await db.begin(async (tx) => {
    const now = new Date();

    if (Object.keys(patch.coin).length) {
      await tx`
        update coins
        set
          logo_url = coalesce(${patch.coin.logoUrl || null}, logo_url),
          description = coalesce(${patch.coin.description || null}, description),
          updated_at = ${now}
        where id = ${coin.id}
      `;
    }

    for (const [type, url] of Object.entries(patch.links)) {
      await upsertCoinLink(tx, coin.id, type, url, now);
    }

    if (holdersCount) {
      await tx`
        insert into market_snapshots (
          coin_id,
          price_usd,
          market_cap_usd,
          volume_24h_usd,
          change_24h,
          liquidity_usd,
          fdv_usd,
          total_supply,
          holders_count,
          market_rank,
          recorded_at
        ) values (
          ${coin.id},
          ${coin.priceUsd},
          ${coin.marketCapUsd},
          ${coin.volume24hUsd},
          ${coin.change24h},
          ${coin.liquidityUsd},
          ${coin.fdvUsd},
          ${coin.totalSupply},
          ${holdersCount},
          ${coin.marketRank},
          ${now}
        )
      `;
    }

    await tx`
      insert into market_sources (
        coin_id,
        provider,
        external_id,
        source_image_url,
        last_metadata_sync_at,
        last_error_code,
        last_error_message,
        last_error_at,
        failure_count,
        next_attempt_at,
        created_at,
        updated_at
      ) values (
        ${coin.id},
        'geckoterminal',
        ${`tron:${coin.contractAddress}`},
        ${sourceImageUrl || null},
        ${now},
        null,
        null,
        null,
        0,
        null,
        ${now},
        ${now}
      )
      on conflict (coin_id, provider) do update set
        external_id = excluded.external_id,
        source_image_url = coalesce(excluded.source_image_url, market_sources.source_image_url),
        last_metadata_sync_at = excluded.last_metadata_sync_at,
        last_error_code = null,
        last_error_message = null,
        last_error_at = null,
        failure_count = 0,
        next_attempt_at = null,
        updated_at = excluded.updated_at
    `;
  });
}

async function upsertCoinLink(tx, coinId, type, url, now) {
  const safeUrl = normalizeUrl(url, type);
  if (!safeUrl) return;

  await tx`
    insert into coin_links (coin_id, type, url, created_at, updated_at)
    values (${coinId}, ${type}, ${safeUrl}, ${now}, ${now})
    on conflict (coin_id, type) do update set
      url = excluded.url,
      updated_at = excluded.updated_at
  `;
}

function extractGeckoTerminalProjectLinks(attributes) {
  if (!attributes || typeof attributes !== 'object') return {};

  return compactObject({
    website: firstUrl('website', pickStringArray(attributes, ['websites'])),
    telegram: firstUrl('telegram', [pickString(attributes, ['telegram_handle'])]),
    x: firstUrl('x', [pickString(attributes, ['twitter_handle'])]),
    discord: firstUrl('discord', [pickString(attributes, ['discord_url'])]),
  });
}

function firstUrl(kind, values) {
  for (const value of values) {
    const url = normalizeUrl(value, kind);
    if (url) return url;
  }
  return '';
}

function normalizeUrl(value, kind = '') {
  if (typeof value !== 'string') return '';
  const trimmed = sanitizePlainText(value).trim();
  if (!trimmed || trimmed.length > 2048) return '';
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '';

  const handleUrl = socialHandleUrl(kind, trimmed);
  if (handleUrl) return handleUrl;

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!url.hostname.includes('.')) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function socialHandleUrl(kind, value) {
  if (kind === 'telegram') {
    const telegramMatch = value.match(/^@?([a-zA-Z0-9_]{5,32})$/);
    if (telegramMatch) return `https://t.me/${telegramMatch[1]}`;
  }

  if (kind === 'x') {
    const xMatch = value.match(/^@?([a-zA-Z0-9_]{1,15})$/);
    if (xMatch) return `https://x.com/${xMatch[1]}`;
  }

  return '';
}

function pickGeckoTerminalImageUrl(attributes) {
  const image = attributes?.image && typeof attributes.image === 'object' ? attributes.image : {};
  return (
    pickString(image, ['large']) ||
    pickString(attributes || {}, ['image_url']) ||
    pickString(image, ['small']) ||
    pickString(image, ['thumb'])
  );
}

async function mirrorRemoteImageToR2(sourceUrl, { contractAddress }) {
  const storage = getR2Config();
  const image = await fetchRemoteImage(sourceUrl);
  const extension = extensionForMime(image.mimeType);
  const key = `tron/logos/${cleanPathSegment(contractAddress) || randomUUID()}.${extension}`;
  const requestUrl = objectRequestUrl(storage.endpoint, storage.bucket, key);

  const response = await fetch(requestUrl, {
    method: 'PUT',
    headers: signedPutHeaders({
      body: image.body,
      cacheControl: R2_IMAGE_CACHE_CONTROL,
      contentType: image.mimeType,
      requestUrl,
      storage,
    }),
    body: image.body,
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed with status ${response.status}.`);
  }

  return {
    key,
    url: storage.publicBaseUrl
      ? publicObjectUrl(storage.publicBaseUrl, key)
      : objectRequestUrl(storage.endpoint, storage.bucket, key),
  };
}

async function fetchRemoteImage(sourceUrl) {
  const url = normalizeUrl(sourceUrl);
  if (!url) throw new Error('Invalid source image URL.');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image fetch failed with status ${response.status}.`);

  const mimeType = response.headers.get('content-type')?.split(';')[0]?.toLowerCase() || '';
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) {
    throw new Error(`Unsupported image type "${mimeType || 'unknown'}".`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length) throw new Error('Image was empty.');
  if (body.length > 1_500_000) throw new Error('Image is larger than 1.5MB.');

  return { body, mimeType };
}

function getR2Config() {
  const endpoint = process.env.R2_ENDPOINT || r2EndpointFromAccountId(process.env.R2_ACCOUNT_ID);
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBaseUrl = process.env.R2_PUBLIC_URL || '';

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Cloudflare R2 storage is not configured.');
  }

  return {
    endpoint: trimTrailingSlash(endpoint),
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: publicBaseUrl ? trimTrailingSlash(publicBaseUrl) : '',
  };
}

function signedPutHeaders({ body, cacheControl, contentType, requestUrl, storage }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const url = new URL(requestUrl);
  const payloadHash = sha256Hex(body);
  const canonicalHeaders =
    [
      `cache-control:${cacheControl}`,
      `content-type:${contentType}`,
      `host:${url.host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
    ].join('\n') + '\n';
  const signedHeaders = 'cache-control;content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const region = 'auto';
  const service = 's3';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = hmacHex(getSigningKey(storage.secretAccessKey, dateStamp), stringToSign);

  return {
    Authorization: [
      `AWS4-HMAC-SHA256 Credential=${storage.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', '),
    'Cache-Control': cacheControl,
    'Content-Type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
}

function getSigningKey(secret, dateStamp) {
  return hmacBuffer(
    hmacBuffer(hmacBuffer(hmacBuffer(`AWS4${secret}`, dateStamp), 'auto'), 's3'),
    'aws4_request',
  );
}

function publicObjectUrl(baseUrl, key) {
  const url = new URL(baseUrl);
  url.pathname = joinPath(url.pathname, key);
  return url.toString();
}

function objectRequestUrl(endpoint, bucket, key) {
  const url = new URL(endpoint);
  url.pathname = joinPath(url.pathname, bucket, key);
  return url.toString();
}

function joinPath(...parts) {
  return `/${parts
    .flatMap((part) => part.split('/'))
    .map((part) => part.trim())
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')}`;
}

function cleanPathSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
}

function extensionForMime(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function pickString(obj, keys) {
  const value = pick(obj, keys);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pickInteger(obj, keys) {
  const value = pick(obj, keys);
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function pickStringArray(obj, keys) {
  const value = pick(obj, keys);
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => typeof item === 'string' && item.trim()),
  );
}

function sanitizePlainText(value) {
  if (typeof value !== 'string') return '';

  return decodeHtmlEntities(value)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/(?:javascript|data|vbscript):/gi, '')
    .replace(/\bon\w+\s*=/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);?/g, (_, code) => codePointToString(Number(code)))
    .replace(/&#x([\da-f]+);?/gi, (_, code) => codePointToString(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function codePointToString(number) {
  if (!Number.isInteger(number) || number < 0 || number > 0x10ffff) return '';
  return String.fromCodePoint(number);
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmacBuffer(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key, value) {
  return createHmac('sha256', key).update(value).digest('hex');
}

function r2EndpointFromAccountId(accountId) {
  return accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '';
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/g, '');
}

function readPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

async function waitForGeckoTerminalSlot() {
  const now = Date.now();
  const delay = Math.max(0, nextGeckoTerminalRequestAt - now);
  nextGeckoTerminalRequestAt =
    Math.max(now, nextGeckoTerminalRequestAt) + GECKOTERMINAL_REQUEST_SPACING_MS;
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}
