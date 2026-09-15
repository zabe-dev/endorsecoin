#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
const batchSize = readPositiveInteger(process.env.X_LISTING_BATCH_SIZE, 20);
const outputPath = process.env.X_LISTING_OUTPUT || 'tmp/x-listing-posts.json';
const postsDir = process.env.X_LISTING_POSTS_DIR || 'tmp/x-posts';

if (!DATABASE_URL) throw new Error('DATABASE_URL is required.');

const chainHandles = {
  ethereum: '@ethereum',
  bsc: '@BNBCHAIN',
  solana: '@solana',
  polygon: '@0xPolygon',
  avalanche: '@avax',
  arbitrum: '@arbitrum',
  base: '@base',
  optimism: '@Optimism',
  dogecoin: '@dogecoin',
  tron: '@trondao',
  fantom: '@FantomFDN',
  kcc: '@KCCOfficialTW',
  sui: '@SuiNetwork',
  hood: '@RobinhoodCrypto',
  xrpl: '@XRPLF',
  other: '',
};

const chainNames = {
  ethereum: 'Ethereum',
  bsc: 'BNB Chain',
  solana: 'Solana',
  polygon: 'Polygon',
  avalanche: 'Avalanche',
  arbitrum: 'Arbitrum',
  base: 'Base',
  optimism: 'Optimism',
  dogecoin: 'Dogecoin',
  tron: 'TRON',
  fantom: 'Fantom',
  kcc: 'KCC',
  sui: 'Sui',
  hood: 'Robinhood',
  xrpl: 'XRP Ledger',
  other: 'Other',
};

const chainQueryValues = {
  ethereum: 'ETH',
  bsc: 'BSC',
  solana: 'SOL',
  polygon: 'MATIC',
  avalanche: 'AVAX',
  arbitrum: 'ARB',
  base: 'BASE',
  optimism: 'OP',
  dogecoin: 'DOGE',
  tron: 'TRX',
  fantom: 'FTM',
  kcc: 'KCC',
  sui: 'SUI',
  hood: 'HOOD',
  xrpl: 'XRPL',
  other: 'Other',
};

const chainTags = {
  ethereum: '#Ethereum',
  bsc: '#BNBChain',
  solana: '#Solana',
  polygon: '#Polygon',
  avalanche: '#Avalanche',
  arbitrum: '#Arbitrum',
  base: '#Base',
  optimism: '#Optimism',
  dogecoin: '#Dogecoin',
  tron: '#TRON',
  fantom: '#Fantom',
  kcc: '#KCC',
  sui: '#Sui',
  hood: '#Robinhood #RobinhoodChain',
  xrpl: '#XRPL',
  other: '#Crypto',
};

const reservedXPaths = new Set([
  'about',
  'account',
  'compose',
  'download',
  'explore',
  'hashtag',
  'home',
  'i',
  'intent',
  'messages',
  'notifications',
  'privacy',
  'search',
  'settings',
  'share',
  'tos',
]);

const db = postgres(DATABASE_URL, {
  max: 1,
  transform: postgres.camel,
  prepare: false,
});

try {
  const rows = await db`
    select
      c.id,
      c.name,
      c.symbol,
      coalesce(c.chain, 'other') as chain,
      c.created_at,
      cl.url as x_url
    from coins c
    left join coin_links cl on cl.coin_id = c.id and cl.type = 'x'
    where c.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
      and c.created_at < (date_trunc('day', now() at time zone 'UTC') + interval '1 day') at time zone 'UTC'
      and c.listing_status = 'active'
    order by c.chain asc nulls last, c.created_at asc, c.id asc
  `;

  const grouped = groupByChain(
    rows.map((row) => ({ ...row, xHandle: extractXHandle(row.xUrl) })).filter((row) => row.xHandle),
  );
  const skipped = rows
    .filter((row) => !extractXHandle(row.xUrl))
    .map((row) => ({
      id: row.id,
      name: row.name,
      symbol: row.symbol,
      chain: row.chain || 'other',
      reason: 'missing_x_link',
    }));
  const posts = [];

  for (const [chain, coins] of grouped) {
    for (let index = 0; index < coins.length; index += batchSize) {
      const batch = coins.slice(index, index + batchSize);
      posts.push({
        chain,
        chainName: chainNames[chain] || chain,
        chainHandle: chainHandles[chain] || '',
        coinCount: batch.length,
        coinIds: batch.map((coin) => coin.id),
        text: buildPost(chain, batch),
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    utcDate: new Date().toISOString().slice(0, 10),
    batchSize,
    postCount: posts.length,
    skippedCount: skipped.length,
    skipped,
    posts,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

  const postFiles = await writePostFiles(posts, postsDir);
  payload.postFiles = postFiles;

  // Re-write the JSON now that it also records where each .txt file landed.
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(JSON.stringify(payload, null, 2));
} finally {
  await db.end();
}

/**
 * Writes one .txt file per post into `dir`, named with a zero-padded
 * index and the chain, e.g. "01-ethereum.txt". Clears out any stale
 * .txt files left over from a previous run first, so old posts don't
 * linger alongside a shorter new batch.
 */
async function writePostFiles(posts, dir) {
  await fs.mkdir(dir, { recursive: true });

  const existing = await fs.readdir(dir);
  await Promise.all(
    existing
      .filter((name) => name.endsWith('.txt'))
      .map((name) => fs.rm(path.join(dir, name), { force: true })),
  );

  const width = String(posts.length).length;
  const files = [];

  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i];
    const index = String(i + 1).padStart(Math.max(width, 2), '0');
    const fileName = `${index}-${post.chain}.txt`;
    const filePath = path.join(dir, fileName);
    await fs.writeFile(filePath, `${post.text}\n`);
    files.push(filePath);
  }

  return files;
}

function buildPost(chain, coins) {
  const chainHandle = chainHandles[chain] || chainNames[chain] || chain;
  const rows = coins.map((coin) => `${coin.name} → ${coin.xHandle}`).join('\n');
  const chainQueryValue = chainQueryValues[chain] || chainQueryValues.other;
  const href = `https://endorsecoin.com/?chain=${encodeURIComponent(chainQueryValue)}#leaderboard`;
  const tags = chainTags[chain] || '#Crypto';

  return [
    `Latest ${chainHandle} coin listings just dropped. 👀`,
    '',
    rows,
    '',
    `🗳️ Explore and cast your votes 👉 ${href}`,
    '',
    `${tags} #Crypto #Altcoins #Memecoins #Web3`,
  ].join('\n');
}

function groupByChain(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const chain = row.chain || 'other';
    if (!grouped.has(chain)) grouped.set(chain, []);
    grouped.get(chain).push(row);
  }
  return grouped;
}

function extractXHandle(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (/^@[A-Za-z0-9_]{1,15}$/.test(trimmed)) return trimmed;
  const direct = trimmed.match(/(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{1,15})(?:\b|$)/);
  if (direct) return `@${direct[1]}`;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'x.com' && host !== 'twitter.com') return '';
    const [handle] = url.pathname.split('/').filter(Boolean);
    if (reservedXPaths.has(handle?.toLowerCase())) return '';
    return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? `@${handle}` : '';
  } catch {
    return '';
  }
}

function readPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
