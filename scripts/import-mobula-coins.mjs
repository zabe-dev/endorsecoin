#!/usr/bin/env node

/**
 * Imports random non-major tokens from Mobula into the current EndorseCoin schema.
 *
 * Usage:
 *   npm run import:mobula
 *   npm run import:mobula -- 10000
 *   npm run import:mobula -- --limit=150
 *   npm run import:mobula:random
 *   npm run import:mobula -- --random --limit=150
 *   npm run import:mobula -- --dry-run
 *   npm run import:mobula -- --dry-run --debug
 *   npm run import:mobula -- --geckoterminal-batch-size=30
 *
 * This script writes only to tables the app currently reads:
 *   - coins
 *   - market_snapshots
 *   - coin_links
 *
 * It also writes market_sources so future imports and market syncs can recognize
 * the same Mobula asset by its chain/address source key. Chart and DEX links are
 * generated only when market data confirms a usable route. Project links are
 * imported only when Mobula provides usable URLs.
 */

import { createHash, createHmac, randomUUID } from 'crypto';
import postgres from 'postgres';

const MOBULA_BASE_URL = 'https://api.mobula.io/api/1/all';
const MOBULA_DETAILS_URL = 'https://api.mobula.io/api/2/asset/details';
const MOBULA_METADATA_URL = 'https://api.mobula.io/api/1/multi-metadata';
const MOBULA_MARKET_DETAILS_URL = 'https://api.mobula.io/api/2/market/details';
const GECKOTERMINAL_API_BASE_URL = trimTrailingSlash(
  process.env.GECKOTERMINAL_API_BASE_URL || 'https://api.geckoterminal.com',
);
const GECKOTERMINAL_TRON_NETWORK = 'tron';
const GECKOTERMINAL_TRON_FALLBACK_MIN = 3;
const GECKOTERMINAL_TRON_FALLBACK_MAX = 5;
const GECKOTERMINAL_TOKEN_BATCH_SIZE = Math.min(
  readPositiveInteger(
    process.argv
      .slice(2)
      .find((arg) => arg.startsWith('--geckoterminal-batch-size='))
      ?.split('=')[1],
    30,
  ),
  30,
);
const GECKOTERMINAL_REQUEST_SPACING_MS = Math.max(
  6100,
  readPositiveInteger(process.env.GECKOTERMINAL_REQUEST_SPACING_MS, 6100),
);
const DATABASE_URL = process.env.DATABASE_URL;
let mobulaApiKeyIndex = 0;

// Used by log()/formatDuration() below so every log line shows elapsed time
// since the script started, making it obvious whether things are progressing
// or stalled during a long run.
const scriptStartTime = Date.now();

const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const positionalLimitArg = args.find((arg) => /^\d+$/.test(arg));
const TARGET_COUNT = readPositiveInteger(limitArg?.split('=')[1] || positionalLimitArg, 250);
const DRY_RUN = args.includes('--dry-run');
const DEBUG = args.includes('--debug');
const RANDOM_IMPORT = args.includes('--random');
const RANDOMIZE = RANDOM_IMPORT && !args.includes('--no-random');
const DETAILS_BATCH_SIZE = Math.min(
  readPositiveInteger(
    args.find((arg) => arg.startsWith('--details-batch-size='))?.split('=')[1],
    10,
  ),
  10,
);
// Market-details batching uses its own size, since Mobula hasn't publicly documented
// the max batch size for this endpoint. Defaults to the same conservative size as
// the other batched endpoints; override with --market-batch-size=N to experiment
// with a larger value (test with --dry-run first).
const MARKET_DETAILS_BATCH_SIZE = readPositiveInteger(
  args.find((arg) => arg.startsWith('--market-batch-size='))?.split('=')[1],
  DETAILS_BATCH_SIZE,
);
const EXCLUDE_TOP_RANK = readPositiveInteger(
  args.find((arg) => arg.startsWith('--exclude-top-rank='))?.split('=')[1],
  150,
);
const SKIP_R2_LOGO_UPLOAD = args.includes('--skip-r2-logo-upload');
const R2_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
let geckoTerminalNextAllowedAt = 0;
const MAX_IMPORT_PRICE_USD = 1_000_000;
const MAX_IMPORT_MARKET_CAP_USD = 1_000_000_000_000;
const MAX_IMPORT_FDV_USD = 1_000_000_000_000;
const MAX_MARKET_DETAIL_PRICE_RATIO = 100;
const IMPORT_SUBMITTED_AT_START = new Date('2026-01-01T00:00:00.000Z');
const NEW_POPULAR_ONLY = !RANDOM_IMPORT;
const NEW_POPULAR_MAX_AGE_DAYS = daysSinceStartOfYear();
const NEW_POPULAR_EXCLUDE_OLDER_THAN_DAYS = 730;
const NEW_POPULAR_MAX_RANK = 5_000;
const NEW_POPULAR_MIN_VOLUME_USD = 10_000;
const NEW_POPULAR_MIN_LIQUIDITY_USD = 10_000;
const NEW_POPULAR_OVERSAMPLE_FACTOR = 6;

if (!DATABASE_URL && !DRY_RUN) {
  throw new Error('DATABASE_URL is required for a real import. Use --dry-run to preview only.');
}

const db = DATABASE_URL
  ? postgres(DATABASE_URL, {
      max: 1,
      transform: postgres.camel,
    })
  : null;

const chainKeys = ['ethereum', 'bsc', 'polygon', 'arbitrum', 'base', 'solana', 'tron'];

const chainAliases = {
  ethereum: (name) => name === 'ethereum',
  bsc: (name) =>
    name === 'bsc' ||
    name === 'bnb' ||
    name.includes('bnb smart chain') ||
    name.includes('binance smart chain'),
  polygon: (name) => name === 'polygon' || name === 'matic' || name.includes('polygon'),
  arbitrum: (name) => name.includes('arbitrum'),
  base: (name) => name === 'base',
  solana: (name) => name === 'solana',
  tron: (name) => name === 'tron' || name === 'trx',
};

const mobulaAssetBlockchains = {
  ethereum: 'ethereum',
  bsc: 'bsc',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  base: 'base',
  solana: 'solana',
  tron: 'tron',
};

const mobulaMetadataBlockchains = {
  ethereum: '1',
  bsc: '56',
  polygon: '137',
  arbitrum: '42161',
  base: '8453',
  solana: 'solana',
  tron: 'tron',
};

const mobulaMarketBlockchains = {
  ethereum: 'ethereum',
  bsc: 'bsc',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  base: 'base',
  solana: 'solana',
};

const mobulaMarketSourceIds = {
  ethereum: 'evm:1',
  bsc: 'evm:56',
  polygon: 'evm:137',
  arbitrum: 'evm:42161',
  base: 'evm:8453',
  solana: 'solana:solana',
  tron: 'tron:728126428',
};

const dexSwapUrlBuilders = {
  solana: (address) => `https://raydium.io/swap/?inputMint=sol&outputMint=${address}`,
  ethereum: (address) => `https://app.uniswap.org/swap?outputCurrency=${address}&chain=mainnet`,
  arbitrum: (address) => `https://app.uniswap.org/swap?outputCurrency=${address}&chain=arbitrum`,
  base: (address) => `https://app.uniswap.org/swap?outputCurrency=${address}&chain=base`,
  bsc: (address) => `https://pancakeswap.finance/swap?outputCurrency=${address}`,
  polygon: (address) => `https://dapp.quickswap.exchange/swap?type=best&to=${address}`,
};

const chartUrlBuilders = {
  ethereum: (address) => `https://dexscreener.com/ethereum/${address}`,
  bsc: (address) => `https://dexscreener.com/bsc/${address}`,
  polygon: (address) => `https://dexscreener.com/polygon/${address}`,
  arbitrum: (address) => `https://dexscreener.com/arbitrum/${address}`,
  base: (address) => `https://dexscreener.com/base/${address}`,
  solana: (address) => `https://dexscreener.com/solana/${address}`,
  tron: (address) => `https://dexscreener.com/tron/${address}`,
};

const geckoTerminalChartUrlBuilders = {
  tron: (poolAddress) => `https://www.geckoterminal.com/tron/pools/${poolAddress}`,
};

const supportedExchangeMatchers = {
  ethereum: [/uniswap/i],
  arbitrum: [/uniswap/i],
  base: [/uniswap/i],
  bsc: [/pancakeswap/i],
  polygon: [/quickswap/i],
  solana: [/raydium/i],
  tron: [],
};

const categoryKeywordMap = {
  AI: {
    strong: [
      'artificial intelligence',
      'machine learning',
      'ai agent',
      'ai agents',
      'neural network',
      'large language model',
      'generative ai',
      'decentralized ai',
    ],
    medium: [
      'ai',
      'agent',
      'agents',
      'neural',
      'llm',
      'model',
      'models',
      'inference',
      'compute',
      'gpu',
      'data intelligence',
      'automation',
      'chatbot',
      'bot',
    ],
    light: ['analytics', 'prediction', 'intelligence'],
  },
  DeFi: {
    strong: [
      'decentralized finance',
      'liquid staking',
      'restaking',
      'yield farming',
      'liquidity mining',
      'perpetual futures',
      'prediction market',
    ],
    medium: [
      'defi',
      'dex',
      'swap',
      'staking',
      'stake',
      'yield',
      'farm',
      'liquidity',
      'lending',
      'borrow',
      'borrowing',
      'vault',
      'amm',
      'pool',
      'lp',
      'perps',
      'derivatives',
      'stablecoin',
      'stablecoins',
      'launchpad',
      'ido',
      'ico',
      'presale',
      'airdrop',
      'airdrop rewards',
    ],
    light: ['finance', 'trading', 'trade', 'exchange', 'earn', 'rewards'],
  },
  Memecoins: {
    strong: ['memecoin', 'memecoins', 'meme coin', 'meme token'],
    medium: [
      'meme',
      'pepe',
      'doge',
      'shib',
      'shiba',
      'inu',
      'floki',
      'bonk',
      'wif',
      'wojak',
      'chad',
      'mascot',
      'community meme',
    ],
    light: ['frog', 'dog', 'cat', 'kitty', 'pup', 'based', 'degen'],
  },
  Gaming: {
    strong: ['gamefi', 'blockchain game', 'web3 game', 'gaming metaverse'],
    medium: [
      'gaming',
      'game',
      'games',
      'quest',
      'battle',
      'arena',
      'rpg',
      'mmorpg',
      'metaverse',
      'avatar',
      'guild',
      'esports',
      'player',
      'players',
      'in-game',
      'virtual world',
    ],
    light: ['play', 'collect', 'questing', 'character'],
  },
  'Play To Earn': {
    strong: [
      'play to earn',
      'play-to-earn',
      'tap to earn',
      'tap-to-earn',
      'move to earn',
      'move-to-earn',
    ],
    medium: ['p2e', 'm2e', 't2e', 'earn rewards', 'earn tokens', 'telegram mini app'],
    light: ['mini app', 'mini-app', 'tap', 'quest rewards'],
  },
  'NFT Platform': {
    strong: ['nft marketplace', 'nft platform', 'non-fungible token'],
    medium: [
      'nft',
      'nfts',
      'non-fungible',
      'collectible',
      'collectibles',
      'mint',
      'minting',
      'marketplace',
      'collection',
      'creator',
      'royalty',
      'ordinals',
    ],
    light: ['art', 'artists', 'digital collectible'],
  },
  'Fan Token': {
    strong: ['fan token', 'sports token', 'club token'],
    medium: [
      'fans',
      'sports',
      'club',
      'team',
      'football',
      'soccer',
      'basketball',
      'ufc',
      'formula 1',
      'f1',
      'esports fan',
      'supporters',
    ],
    light: ['league', 'stadium', 'athlete'],
  },
  Gambling: {
    strong: ['online casino', 'sportsbook', 'prediction betting'],
    medium: [
      'gambling',
      'casino',
      'bet',
      'bets',
      'betting',
      'poker',
      'lottery',
      'jackpot',
      'wager',
      'wagering',
      'roulette',
      'slots',
      'raffle',
    ],
    light: ['odds', 'dice', 'lotto'],
  },
  'Utility Token': {
    strong: [
      'real world assets',
      'tokenized assets',
      'decentralized physical infrastructure',
      'cross-chain bridge',
      'identity protocol',
      'privacy protocol',
      'data availability',
    ],
    medium: [
      'utility',
      'payment',
      'payments',
      'pay',
      'infrastructure',
      'protocol',
      'oracle',
      'data',
      'identity',
      'storage',
      'privacy',
      'security',
      'bridge',
      'cross-chain',
      'interoperability',
      'governance',
      'enterprise',
      'network',
      'api',
      'tool',
      'tools',
      'service',
      'rwa',
      'depin',
      'layer 1',
      'layer 2',
      'l1',
      'l2',
      'wallet',
      'wallets',
      'messaging',
      'socialfi',
      'dao',
      'rollup',
      'rollups',
      'modular',
    ],
    light: ['chain', 'mainnet', 'validator', 'node', 'nodes', 'appchain', 'sdk'],
  },
};

const symbolDenylist = new Set(
  [
    'USDT',
    'USDC',
    'USDC.E',
    'DAI',
    'BUSD',
    'TUSD',
    'USDD',
    'FDUSD',
    'USDE',
    'PYUSD',
    'WETH',
    'WBTC',
    'WBNB',
    'WSOL',
    'WMATIC',
    'WAVAX',
    'ETH',
    'BNB',
    'SOL',
    'BTC',
    'MATIC',
    'AVAX',
    'STETH',
    'WSTETH',
    'WEETH',
    'CBBTC',
    'CBETH',
    'RETH',
    'LINK',
    'UNI',
    'AAVE',
    'MKR',
    'LDO',
    'ARB',
    'OP',
  ].map((symbol) => symbol.toUpperCase()),
);

function matchChain(blockchainName) {
  const normalized = blockchainName.toLowerCase().trim();
  return chainKeys.find((chain) => chainAliases[chain](normalized));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Logging helpers -----------------------------------------------------
//
// Every log line is prefixed with elapsed time since the script started
// (e.g. "[+2m14s]") so it's obvious from the output alone whether a long
// run is progressing normally or has stalled somewhere.

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}

function log(message) {
  console.log(`[+${formatDuration(Date.now() - scriptStartTime)}] ${message}`);
}

function logSection(title) {
  console.log(`\n[+${formatDuration(Date.now() - scriptStartTime)}] === ${title} ===`);
}

// Logs batch progress at a handful of evenly-spaced points (not every batch,
// so a 900-batch run doesn't print 900 lines) with a live ETA based on the
// average time per batch so far. Always logs the first and last batch.
// Shows both the batch number and the underlying token count (X/Y) so it's
// clear exactly which token range has been processed, not just which batch.
function logBatchProgress(
  label,
  batchNumber,
  totalBatches,
  tokensSoFar,
  totalTokens,
  phaseStartedAt,
) {
  const logEvery = Math.max(1, Math.round(totalBatches / 20));
  const isFirst = batchNumber === 1;
  const isLast = batchNumber === totalBatches;

  if (!isFirst && !isLast && batchNumber % logEvery !== 0) return;

  const elapsedMs = Date.now() - phaseStartedAt;
  const pct = ((tokensSoFar / totalTokens) * 100).toFixed(0);
  const ratePerMs = tokensSoFar / elapsedMs;
  const remainingTokens = totalTokens - tokensSoFar;
  const etaMs = ratePerMs > 0 ? remainingTokens / ratePerMs : 0;

  log(
    `${label}: token ${tokensSoFar}/${totalTokens} (${pct}%, batch ${batchNumber}/${totalBatches})` +
      (isLast ? ` — done in ${formatDuration(elapsedMs)}` : ` — ETA ${formatDuration(etaMs)}`),
  );
}

// Logs import-loop progress at a handful of evenly-spaced points (scales with
// total size, so a 500-token run and a 9,000-token run both get ~20 updates)
// with a live ETA, plus always the first and last token.
function logImportProgress(current, total, phaseStartedAt) {
  const every = Math.max(1, Math.round(total / 20));
  const isFirst = current === 1;
  const isLast = current === total;
  if (!isFirst && !isLast && current % every !== 0) return;

  const elapsedMs = Date.now() - phaseStartedAt;
  const pct = ((current / total) * 100).toFixed(1);
  const ratePerMs = current / elapsedMs;
  const remaining = total - current;
  const etaMs = ratePerMs > 0 ? remaining / ratePerMs : 0;

  log(
    `Import progress: token ${current}/${total} (${pct}%)` +
      (isLast ? ` — done in ${formatDuration(elapsedMs)}` : ` — ETA ${formatDuration(etaMs)}`),
  );
}

async function fetchGeckoTerminalTronFallbackTokens(existingState, existingCandidates = []) {
  const desiredCount = randomInteger(
    GECKOTERMINAL_TRON_FALLBACK_MIN,
    GECKOTERMINAL_TRON_FALLBACK_MAX,
  );
  log(
    `Requesting ${desiredCount} fallback TRON token candidate(s) from GeckoTerminal recently updated tokens...`,
  );

  await waitForGeckoTerminalSlot();

  const url = new URL('/api/v2/tokens/info_recently_updated', GECKOTERMINAL_API_BASE_URL);
  url.searchParams.set('include', 'network');
  url.searchParams.set('network', GECKOTERMINAL_TRON_NETWORK);

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json;version=20230203' },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(
        `GeckoTerminal TRON fallback request failed: ${response.status} ${response.statusText}${
          errorText ? ` — ${errorText.slice(0, 500)}` : ''
        }`,
      );
      return [];
    }

    const json = await response.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    const candidateState = {
      contracts: new Set(
        existingCandidates
          .map((token) => contractKey(token.contract.chain, token.contract.address))
          .filter(Boolean),
      ),
      marketSourceIds: new Set(
        existingCandidates.map((token) => marketSourceExternalId(token)).filter(Boolean),
      ),
    };
    const fallbackTokens = [];

    for (const row of RANDOMIZE ? shuffle(rows) : rows) {
      if (fallbackTokens.length >= desiredCount) break;
      const token = buildGeckoTerminalTronToken(row);
      if (!token) continue;
      if (isExistingTokenCandidate(token, existingState, candidateState)) continue;

      fallbackTokens.push(token);
      const key = contractKey(token.contract.chain, token.contract.address);
      const sourceId = marketSourceExternalId(token);
      if (key) candidateState.contracts.add(key);
      if (sourceId) candidateState.marketSourceIds.add(sourceId);
    }

    log(
      `GeckoTerminal TRON fallback added ${fallbackTokens.length}/${desiredCount} token candidate(s).`,
    );
    return fallbackTokens;
  } catch (error) {
    console.warn(
      `GeckoTerminal TRON fallback request threw: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    if (DEBUG) console.warn(error);
    return [];
  }
}

async function fetchMobulaAssets() {
  log('Requesting full asset list from Mobula (GET /api/1/all)...');
  const url = new URL(MOBULA_BASE_URL);
  url.searchParams.set(
    'fields',
    [
      'price',
      'market_cap',
      'market_cap_diluted',
      'liquidity',
      'volume',
      'price_change_24h',
      'blockchains',
      'contracts',
      'logo',
      'rank',
      'listed_at',
      'listedAt',
      'total_supply',
      'holders_count',
      'description',
      'category',
      'categories',
      'tags',
      'sectors',
      'narratives',
      'socials',
      'website',
      'twitter',
      'telegram',
      'discord',
      'github',
    ].join(','),
  );

  const response = await fetch(url, {
    headers: mobulaAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Mobula request failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const list = Array.isArray(json) ? json : json?.data;

  if (!Array.isArray(list)) {
    console.error('Unexpected Mobula response shape:', JSON.stringify(json).slice(0, 1500));
    throw new Error('Mobula response was not a token list.');
  }

  log(`Received ${list.length} assets from Mobula.`);

  if (DEBUG && list.length) {
    console.log('Sample Mobula item:');
    console.log(JSON.stringify(list[0], null, 2));
  }

  return list;
}

async function enrichTokensWithMobulaDetails(tokens) {
  if (!tokens.length) return tokens;

  const totalBatches = Math.ceil(tokens.length / DETAILS_BATCH_SIZE);
  logSection(
    `Phase 1/3: Asset details (dates + links) — ${tokens.length} tokens, ${totalBatches} batch(es) of ${DETAILS_BATCH_SIZE}`,
  );

  let enrichedCount = 0;
  let batchNumber = 0;
  const phaseStartedAt = Date.now();

  for (let index = 0; index < tokens.length; index += DETAILS_BATCH_SIZE) {
    batchNumber += 1;
    const batch = tokens.slice(index, index + DETAILS_BATCH_SIZE);
    const details = await fetchMobulaAssetDetailsBatch(batch);

    details.forEach((detail, detailIndex) => {
      const token = batch[detailIndex];
      if (!token || !detail) return;

      if (applyMobulaAssetDetails(token, detail)) enrichedCount += 1;
    });

    logBatchProgress(
      'Asset details',
      batchNumber,
      totalBatches,
      Math.min(index + DETAILS_BATCH_SIZE, tokens.length),
      tokens.length,
      phaseStartedAt,
    );

    if (index + DETAILS_BATCH_SIZE < tokens.length) {
      await sleep(1100);
    }
  }

  log(
    `Phase 1/3 done: applied asset details to ${enrichedCount}/${tokens.length} token(s) in ${formatDuration(Date.now() - phaseStartedAt)}.`,
  );
  return tokens;
}

async function enrichTokensWithMobulaMetadata(tokens) {
  if (!tokens.length) return tokens;

  const totalBatches = Math.ceil(tokens.length / DETAILS_BATCH_SIZE);
  logSection(
    `Phase 2/3: Metadata (trust + social links) — ${tokens.length} tokens, ${totalBatches} batch(es) of ${DETAILS_BATCH_SIZE}`,
  );

  let enrichedCount = 0;
  let batchNumber = 0;
  const phaseStartedAt = Date.now();

  for (let index = 0; index < tokens.length; index += DETAILS_BATCH_SIZE) {
    batchNumber += 1;
    const batch = tokens.slice(index, index + DETAILS_BATCH_SIZE);
    const details = await fetchMobulaMetadataBatch(batch);

    details.forEach((detail, detailIndex) => {
      const token = batch[detailIndex];
      if (!token || !detail) return;

      if (applyMobulaMetadata(token, detail)) enrichedCount += 1;
    });

    logBatchProgress(
      'Metadata',
      batchNumber,
      totalBatches,
      Math.min(index + DETAILS_BATCH_SIZE, tokens.length),
      tokens.length,
      phaseStartedAt,
    );

    if (index + DETAILS_BATCH_SIZE < tokens.length) {
      await sleep(1100);
    }
  }

  log(
    `Phase 2/3 done: applied metadata to ${enrichedCount}/${tokens.length} token(s) in ${formatDuration(Date.now() - phaseStartedAt)}.`,
  );
  return tokens;
}

// --- Market details enrichment -------------------------------------------------
//
// Mobula's /api/2/market/details endpoint supports a POST batch mode ("Support
// batch queries via POST for fetching multiple markets in one request" per their
// docs), just like /api/2/asset/details above. Batching this the same way turns
// what used to be one request per token (thousands of sequential 1rps calls) into
// one request per MARKET_DETAILS_BATCH_SIZE tokens - the same shape as the other
// two enrichment passes. This keeps the 1 request/sec pacing intact; it just cuts
// the *number* of requests needed, which is what actually blew up runtime on large
// imports. If a batch ever comes back malformed (wrong item count, request error),
// we fall back to the original one-at-a-time calls for just that batch so no data
// is silently dropped.

async function enrichTokensWithGeckoTerminalInfo(tokens) {
  const tronTokens = tokens.filter(
    (token) => token.contract.chain === 'tron' && needsGeckoTerminalInfo(token),
  );
  if (!tronTokens.length) return tokens;

  logSection(
    `TRON enrichment: GeckoTerminal token info — ${tronTokens.length} token(s) missing profile data, 1 request each`,
  );

  let enrichedCount = 0;
  const phaseStartedAt = Date.now();

  for (let index = 0; index < tronTokens.length; index += 1) {
    const token = tronTokens[index];
    const info = await fetchGeckoTerminalTokenInfo(token.contract.address);
    if (info && applyGeckoTerminalTokenInfo(token, info)) enrichedCount += 1;

    logBatchProgress(
      'GeckoTerminal info',
      index + 1,
      tronTokens.length,
      index + 1,
      tronTokens.length,
      phaseStartedAt,
    );
  }

  log(
    `TRON enrichment done: applied GeckoTerminal info to ${enrichedCount}/${tronTokens.length} token(s) in ${formatDuration(Date.now() - phaseStartedAt)}.`,
  );
  return tokens;
}

async function enrichTokensWithGeckoTerminalMarketDetails(tokens) {
  const tronTokens = tokens.filter((token) => token.contract.chain === 'tron');
  if (!tronTokens.length) return tokens;

  const totalBatches = Math.ceil(tronTokens.length / GECKOTERMINAL_TOKEN_BATCH_SIZE);
  logSection(
    `TRON enrichment: GeckoTerminal market data — ${tronTokens.length} token(s), ${totalBatches} batch(es) of ${GECKOTERMINAL_TOKEN_BATCH_SIZE}`,
  );

  let enrichedCount = 0;
  let batchNumber = 0;
  const phaseStartedAt = Date.now();

  for (let index = 0; index < tronTokens.length; index += GECKOTERMINAL_TOKEN_BATCH_SIZE) {
    batchNumber += 1;
    const batch = tronTokens.slice(index, index + GECKOTERMINAL_TOKEN_BATCH_SIZE);
    const details = await fetchGeckoTerminalTokenMarketBatch(batch);

    details.forEach((detail, detailIndex) => {
      const token = batch[detailIndex];
      if (!token || !detail) return;
      if (applyGeckoTerminalMarketDetails(token, detail)) enrichedCount += 1;
    });

    logBatchProgress(
      'GeckoTerminal market data',
      batchNumber,
      totalBatches,
      Math.min(index + GECKOTERMINAL_TOKEN_BATCH_SIZE, tronTokens.length),
      tronTokens.length,
      phaseStartedAt,
    );
  }

  log(
    `TRON market enrichment done: applied GeckoTerminal market data to ${enrichedCount}/${tronTokens.length} token(s) in ${formatDuration(Date.now() - phaseStartedAt)}.`,
  );
  return tokens;
}

async function enrichTokensWithMobulaMarketDetails(tokens) {
  if (!tokens.length) return tokens;

  const usableTokens = tokens.filter((token) => mobulaMarketBlockchains[token.contract.chain]);
  const skippedCount = tokens.length - usableTokens.length;

  if (!usableTokens.length) {
    log('Phase 3/3: Market details — skipped, no tokens on a supported chain.');
    return tokens;
  }

  const totalBatches = Math.ceil(usableTokens.length / MARKET_DETAILS_BATCH_SIZE);
  logSection(
    `Phase 3/3: Market details (chart/DEX links) — ${usableTokens.length} tokens, ${totalBatches} batch(es) of ${MARKET_DETAILS_BATCH_SIZE}` +
      (skippedCount ? ` (${skippedCount} skipped, unsupported chain)` : ''),
  );

  let enrichedCount = 0;
  let batchNumber = 0;
  const phaseStartedAt = Date.now();

  for (let index = 0; index < usableTokens.length; index += MARKET_DETAILS_BATCH_SIZE) {
    batchNumber += 1;
    const batch = usableTokens.slice(index, index + MARKET_DETAILS_BATCH_SIZE);
    const details = await fetchMobulaMarketDetailsBatch(batch);

    details.forEach((detail, detailIndex) => {
      const token = batch[detailIndex];
      if (!token || !detail) return;
      if (applyMobulaMarketDetails(token, detail)) enrichedCount += 1;
    });

    logBatchProgress(
      'Market details',
      batchNumber,
      totalBatches,
      Math.min(index + MARKET_DETAILS_BATCH_SIZE, usableTokens.length),
      usableTokens.length,
      phaseStartedAt,
    );

    if (index + MARKET_DETAILS_BATCH_SIZE < usableTokens.length) {
      await sleep(1100);
    }
  }

  log(
    `Phase 3/3 done: applied market details to ${enrichedCount}/${tokens.length} token(s) in ${formatDuration(
      Date.now() - phaseStartedAt,
    )}.`,
  );
  return tokens;
}

async function fetchGeckoTerminalTokenInfo(address) {
  await waitForGeckoTerminalSlot();

  const url = new URL(
    `/api/v2/networks/${GECKOTERMINAL_TRON_NETWORK}/tokens/${encodeURIComponent(address)}/info`,
    GECKOTERMINAL_API_BASE_URL,
  );

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json;version=20230203' },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (DEBUG) {
        console.warn(
          `GeckoTerminal token info failed for ${address}: ${response.status} ${response.statusText}${
            errorText ? ` — ${errorText.slice(0, 500)}` : ''
          }`,
        );
      }
      return null;
    }

    const json = await response.json();
    return json?.data?.attributes || null;
  } catch (error) {
    if (DEBUG) console.warn(`GeckoTerminal token info failed for ${address}:`, error);
    return null;
  }
}

async function fetchGeckoTerminalTokenMarketBatch(tokens) {
  await waitForGeckoTerminalSlot();

  const addressPath = tokens.map((token) => encodeURIComponent(token.contract.address)).join(',');
  const url = new URL(
    `/api/v2/networks/${GECKOTERMINAL_TRON_NETWORK}/tokens/multi/${addressPath}`,
    GECKOTERMINAL_API_BASE_URL,
  );
  url.searchParams.set('include', 'top_pools');

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json;version=20230203' },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `GeckoTerminal market batch failed: ${response.status} ${response.statusText}${
          errorText ? ` — ${errorText.slice(0, 500)}` : ''
        }`,
      );
    }

    const json = await response.json();
    const data = Array.isArray(json?.data) ? json.data : [];
    const included = Array.isArray(json?.included) ? json.included : [];
    const tokenByAddress = new Map();
    const poolById = new Map();

    for (const item of data) {
      const attributes = item?.attributes;
      const address = normalizeContractAddress(pickString(attributes || {}, ['address']));
      if (address) tokenByAddress.set(address, item);
    }

    for (const item of included) {
      if (item?.type === 'pool' && typeof item.id === 'string') poolById.set(item.id, item);
    }

    return tokens.map((token) => {
      const item = tokenByAddress.get(normalizeContractAddress(token.contract.address));
      if (!item?.attributes) return null;
      const topPoolId = item.relationships?.top_pools?.data?.[0]?.id;
      const topPool = typeof topPoolId === 'string' ? poolById.get(topPoolId) : null;
      return { token: item.attributes, pool: topPool?.attributes || null };
    });
  } catch (error) {
    console.warn(
      `[+${formatDuration(Date.now() - scriptStartTime)}] ⚠ GeckoTerminal TRON market batch failed (${
        error instanceof Error ? error.message : 'unknown error'
      }). Selected TRON tokens will keep existing market values.`,
    );
    if (DEBUG) console.warn(error);
    return tokens.map(() => null);
  }
}

function applyGeckoTerminalTokenInfo(token, attributes) {
  if (!attributes || typeof attributes !== 'object') return false;

  const before = JSON.stringify({
    name: token.name,
    symbol: token.symbol,
    logo: token.logo,
    description: token.description,
    projectLinks: token.projectLinks,
    holdersCount: token.holdersCount,
    classificationTerms: token.classificationTerms,
  });

  token.name = pickString(attributes, ['name']) || token.name;
  token.symbol = pickString(attributes, ['symbol']) || token.symbol;
  token.logo = pickGeckoTerminalImageUrl(attributes) || token.logo;
  token.description =
    sanitizePlainText(pickString(attributes, ['description'])) || token.description;
  token.holdersCount = pickInteger(attributes.holders || {}, ['count']) ?? token.holdersCount;
  token.classificationTerms = [
    ...token.classificationTerms,
    ...extractClassificationTerms(attributes),
    ...pickStringArray(attributes, ['gt_categories_id']),
  ];
  token.projectLinks = {
    ...token.projectLinks,
    ...extractGeckoTerminalProjectLinks(attributes),
  };

  return (
    before !==
    JSON.stringify({
      name: token.name,
      symbol: token.symbol,
      logo: token.logo,
      description: token.description,
      projectLinks: token.projectLinks,
      holdersCount: token.holdersCount,
      classificationTerms: token.classificationTerms,
    })
  );
}

function applyGeckoTerminalMarketDetails(token, details) {
  if (!details || typeof details !== 'object') return false;
  const tokenAttributes = details.token || {};
  const poolAttributes = details.pool || {};
  const poolAddress = pickString(poolAttributes, ['address']);
  const volumeUsd =
    tokenAttributes.volume_usd && typeof tokenAttributes.volume_usd === 'object'
      ? tokenAttributes.volume_usd
      : {};
  const priceChange =
    poolAttributes.price_change_percentage &&
    typeof poolAttributes.price_change_percentage === 'object'
      ? poolAttributes.price_change_percentage
      : {};

  const before = JSON.stringify({
    chartUrl: token.chartUrl,
    dexUrl: token.dexUrl,
    price: token.price,
    marketCap: token.marketCap,
    liquidity: token.liquidity,
    volume: token.volume,
    change24h: token.change24h,
    totalSupply: token.totalSupply,
    holdersCount: token.holdersCount,
    launchDate: token.launchDate,
  });

  token.name = pickString(tokenAttributes, ['name']) || token.name;
  token.symbol = pickString(tokenAttributes, ['symbol']) || token.symbol;
  token.logo = pickGeckoTerminalImageUrl(tokenAttributes) || token.logo;
  token.price = pickSaneMarketDetailNumber(
    token,
    'price',
    pickNumber(tokenAttributes, ['price_usd']),
  );
  token.marketCap = pickSaneMarketDetailNumber(
    token,
    'marketCap',
    pickNumber(tokenAttributes, ['market_cap_usd']) ??
      pickNumber(poolAttributes, ['market_cap_usd']),
  );
  token.fdv = pickSaneMarketDetailNumber(
    token,
    'fdv',
    pickNumber(tokenAttributes, ['fdv_usd']) ?? pickNumber(poolAttributes, ['fdv_usd']),
  );
  token.liquidity =
    pickNumber(tokenAttributes, ['total_reserve_in_usd']) ??
    pickNumber(poolAttributes, ['reserve_in_usd']) ??
    token.liquidity;
  token.volume =
    pickNumber(volumeUsd, ['h24']) ??
    pickNumber(poolAttributes.volume_usd || {}, ['h24']) ??
    token.volume;
  token.change24h = pickNumber(priceChange, ['h24']) ?? token.change24h;
  token.totalSupply =
    pickNumber(tokenAttributes, ['normalized_total_supply', 'total_supply']) ?? token.totalSupply;
  token.launchDate = pickDate(poolAttributes, ['pool_created_at']) || token.launchDate;
  token.marketExchangeName = 'GeckoTerminal';
  token.marketExchangeSupported = true;
  token.dexUrl = buildDexSwapUrl(token) || token.dexUrl;

  if (poolAddress) {
    token.chartPairAddress = poolAddress;
    if (!isDexScreenerChartUrl(token.chartUrl)) {
      token.chartUrl = geckoTerminalChartUrlBuilders.tron(poolAddress);
    }
  } else if (!token.chartUrl) {
    token.chartUrl = chartUrlBuilders.tron(token.contract.address);
  }

  return (
    before !==
    JSON.stringify({
      chartUrl: token.chartUrl,
      dexUrl: token.dexUrl,
      price: token.price,
      marketCap: token.marketCap,
      liquidity: token.liquidity,
      volume: token.volume,
      change24h: token.change24h,
      totalSupply: token.totalSupply,
      holdersCount: token.holdersCount,
      launchDate: token.launchDate,
    })
  );
}

function needsGeckoTerminalInfo(token) {
  const links = token.projectLinks || {};
  return (
    !token.logo ||
    !token.description ||
    !links.website ||
    !links.telegram ||
    !links.x ||
    !links.discord ||
    !token.holdersCount
  );
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

function pickGeckoTerminalImageUrl(attributes) {
  const image = attributes?.image && typeof attributes.image === 'object' ? attributes.image : {};
  return (
    pickString(image, ['large']) ||
    pickString(attributes || {}, ['image_url']) ||
    pickString(image, ['small']) ||
    pickString(image, ['thumb'])
  );
}

async function waitForGeckoTerminalSlot() {
  const now = Date.now();
  const delay = Math.max(0, geckoTerminalNextAllowedAt - now);
  geckoTerminalNextAllowedAt =
    Math.max(now, geckoTerminalNextAllowedAt) + GECKOTERMINAL_REQUEST_SPACING_MS;
  if (delay > 0) await sleep(delay);
}

async function fetchMobulaMetadataBatch(tokens) {
  const usableTokens = tokens.filter((token) => mobulaMetadataBlockchains[token.contract.chain]);
  if (!usableTokens.length) return [];

  const url = new URL(MOBULA_METADATA_URL);
  url.searchParams.set('assets', usableTokens.map((token) => token.contract.address).join(','));
  url.searchParams.set(
    'blockchains',
    usableTokens.map((token) => mobulaMetadataBlockchains[token.contract.chain]).join(','),
  );

  try {
    const response = await fetch(url, {
      headers: mobulaAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Mobula metadata request failed: ${response.status} ${response.statusText}${
          errorText ? ` — ${errorText.slice(0, 500)}` : ''
        }`,
      );
    }

    const json = await response.json();
    const payload = Array.isArray(json?.data) ? json.data : [];
    const details = payload.map((item) => item?.data || item || null);

    return tokens.map((token) => {
      const expectedIndex = usableTokens.findIndex((usable) => usable === token);
      return expectedIndex >= 0 ? details[expectedIndex] || null : null;
    });
  } catch (error) {
    console.warn(
      `Mobula metadata batch failed; selected tokens will keep existing trust/link data. ${
        error instanceof Error ? error.message : ''
      }`,
    );
    if (DEBUG) console.warn(error);
    return tokens.map(() => null);
  }
}

async function fetchMobulaMarketDetails(token) {
  const blockchain = mobulaMarketBlockchains[token.contract.chain];
  if (!blockchain) return null;

  const url = new URL(MOBULA_MARKET_DETAILS_URL);
  url.searchParams.set('blockchain', blockchain);
  url.searchParams.set('address', token.contract.address);

  try {
    const response = await fetch(url, {
      headers: mobulaAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (DEBUG) {
        console.warn(
          `Mobula market details failed for ${token.symbol}: ${response.status} ${response.statusText}${
            errorText ? ` — ${errorText.slice(0, 500)}` : ''
          }`,
        );
      }
      return null;
    }

    const json = await response.json();
    return json?.data || null;
  } catch (error) {
    if (DEBUG) console.warn(`Mobula market details failed for ${token.symbol}:`, error);
    return null;
  }
}

// Batched replacement for calling fetchMobulaMarketDetails once per token.
// Falls back to fetchMarketDetailsIndividually (which reuses the single-token
// function above) if the batch request errors or returns an unexpected shape.
async function fetchMobulaMarketDetailsBatch(tokens) {
  const body = {
    items: tokens.map((token) => ({
      blockchain: mobulaMarketBlockchains[token.contract.chain],
      address: token.contract.address,
    })),
  };

  try {
    const response = await fetch(MOBULA_MARKET_DETAILS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...mobulaAuthHeaders(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Mobula market details batch failed: ${response.status} ${response.statusText}${
          errorText ? ` — ${errorText.slice(0, 500)}` : ''
        }`,
      );
    }

    const json = await response.json();
    const payload = Array.isArray(json?.payload)
      ? json.payload
      : Array.isArray(json?.data)
        ? json.data
        : [];

    if (payload.length !== tokens.length) {
      console.warn(
        `[+${formatDuration(Date.now() - scriptStartTime)}] ⚠ Market details batch mismatch: expected ${tokens.length} items, got ${payload.length}. Falling back to one-at-a-time requests for this batch of ${tokens.length} token(s) (slower, but safe).`,
      );
      return fetchMarketDetailsIndividually(tokens);
    }

    return payload;
  } catch (error) {
    console.warn(
      `[+${formatDuration(Date.now() - scriptStartTime)}] ⚠ Market details batch request failed (${
        error instanceof Error ? error.message : 'unknown error'
      }). Falling back to one-at-a-time requests for this batch of ${tokens.length} token(s).`,
    );
    if (DEBUG) console.warn(error);
    return fetchMarketDetailsIndividually(tokens);
  }
}

// Same 1 request/sec pacing as before - used only as a per-batch fallback now,
// not as the primary path, so it should rarely run for a full import.
async function fetchMarketDetailsIndividually(tokens) {
  const details = [];
  for (const token of tokens) {
    details.push(await fetchMobulaMarketDetails(token));
    await sleep(1100);
  }
  return details;
}

function applyMobulaMarketDetails(token, details) {
  if (!details || typeof details !== 'object') return false;

  const pairAddress = pickString(details, ['address']);
  const dexscreenerListed = pickOptionalBoolean(details, [
    'dexscreenerListed',
    'dexscreener_listed',
  ]);
  const exchangeName = pickString(details.exchange || {}, ['name']);
  const exchangeIsSupported = isSupportedExchange(token.contract.chain, exchangeName);
  const knownUnsupportedExchange = Boolean(exchangeName && !exchangeIsSupported);
  const customChartUrl = findChartUrl(details);
  const customDexUrl = findDexUrl(details);
  const before = JSON.stringify({
    chartUrl: token.chartUrl,
    dexUrl: token.dexUrl,
    price: token.price,
    marketCap: token.marketCap,
    liquidity: token.liquidity,
    volume: token.volume,
    change24h: token.change24h,
    projectLinks: token.projectLinks,
  });

  if (
    canUseDexScreenerChart(token, { pairAddress, dexscreenerListed }) &&
    chartUrlBuilders[token.contract.chain]
  ) {
    token.chartUrl = chartUrlBuilders[token.contract.chain](pairAddress || token.contract.address);
    token.chartPairAddress = pairAddress;
  } else if (knownUnsupportedExchange && customChartUrl) {
    token.chartUrl = customChartUrl;
  } else {
    token.chartUrl = '';
  }

  if (exchangeIsSupported && dexSwapUrlBuilders[token.contract.chain]) {
    token.dexUrl = buildDexSwapUrl(token);
  } else if (knownUnsupportedExchange && customDexUrl) {
    token.dexUrl = customDexUrl;
  } else {
    token.dexUrl = '';
  }

  token.price = pickSaneMarketDetailNumber(
    token,
    'price',
    pickNumber(details, ['priceUSD', 'price_usd']),
  );
  token.marketCap = pickSaneMarketDetailNumber(
    token,
    'marketCap',
    pickNumber(details, ['marketCapUSD', 'market_cap_usd']) ??
      pickNumber(details.base || {}, ['marketCapUSD', 'market_cap_usd']),
  );
  token.fdv = pickSaneMarketDetailNumber(
    token,
    'fdv',
    pickNumber(details, ['marketCapDilutedUSD', 'market_cap_diluted_usd']) ??
      pickNumber(details.base || {}, ['marketCapDilutedUSD', 'market_cap_diluted_usd']),
  );
  token.volume = pickSaneMarketDetailNumber(
    token,
    'volume',
    pickNumber(details, ['volume24hUSD', 'volume_24h_usd']),
  );
  token.change24h =
    pickNumber(details, ['priceChange24hPercentage', 'price_change_24h_percentage']) ??
    token.change24h;
  token.liquidity = pickNumber(details, ['liquidityUSD', 'liquidity_usd']) ?? token.liquidity;
  token.totalSupply =
    pickNumber(details, ['totalSupply', 'total_supply']) ??
    pickNumber(details.base || {}, ['totalSupply', 'total_supply']) ??
    token.totalSupply;
  token.holdersCount =
    pickInteger(details, ['holdersCount', 'holders_count']) ??
    pickInteger(details.base || {}, ['holdersCount', 'holders_count']) ??
    token.holdersCount;
  token.logo =
    pickString(details.base || {}, ['logo', 'logoUrl', 'logo_url']) ||
    pickString(details, ['logo', 'logoUrl', 'logo_url']) ||
    token.logo;
  token.description =
    sanitizePlainText(
      pickString(details, ['description']) || pickString(details.base || {}, ['description']),
    ) || token.description;
  token.projectLinks = {
    ...token.projectLinks,
    ...extractProjectLinks(details),
    ...extractProjectLinks(details.base),
  };
  token.marketExchangeName = exchangeName || token.marketExchangeName;
  token.marketExchangeSupported = exchangeIsSupported;

  return (
    before !==
    JSON.stringify({
      chartUrl: token.chartUrl,
      dexUrl: token.dexUrl,
      price: token.price,
      marketCap: token.marketCap,
      liquidity: token.liquidity,
      volume: token.volume,
      change24h: token.change24h,
      projectLinks: token.projectLinks,
    })
  );
}

async function fetchMobulaAssetDetailsBatch(tokens) {
  const body = tokens.map((token) => ({
    blockchain: mobulaAssetBlockchains[token.contract.chain] || token.contract.blockchain,
    address: token.contract.address,
    tokensLimit: 1,
  }));

  try {
    const response = await fetch(MOBULA_DETAILS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...mobulaAuthHeaders(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Mobula details request failed: ${response.status} ${response.statusText}${
          errorText ? ` — ${errorText.slice(0, 500)}` : ''
        }`,
      );
    }

    const json = await response.json();
    const payload = Array.isArray(json?.payload)
      ? json.payload
      : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.data?.payload)
          ? json.data.payload
          : [];

    if (!Array.isArray(payload)) return [];
    return payload;
  } catch (error) {
    console.warn(
      `Mobula details batch failed; selected tokens will keep any list-level date data. ${
        error instanceof Error ? error.message : ''
      }`,
    );
    if (DEBUG) console.warn(error);
    return fetchMobulaAssetDetailsIndividually(tokens);
  }
}

async function fetchMobulaAssetDetailsIndividually(tokens) {
  const details = [];

  for (const token of tokens) {
    const url = new URL(MOBULA_DETAILS_URL);
    url.searchParams.set(
      'blockchain',
      mobulaAssetBlockchains[token.contract.chain] || token.contract.blockchain,
    );
    url.searchParams.set('address', token.contract.address);
    url.searchParams.set('tokensLimit', '1');

    try {
      const response = await fetch(url, {
        headers: mobulaAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (DEBUG) {
          console.warn(
            `Mobula details single request failed for ${token.symbol}: ${response.status} ${response.statusText}${
              errorText ? ` — ${errorText.slice(0, 500)}` : ''
            }`,
          );
        }
        details.push(null);
        continue;
      }

      const json = await response.json();
      details.push(json?.data || null);
    } catch (error) {
      if (DEBUG) console.warn(`Mobula details single request failed for ${token.symbol}:`, error);
      details.push(null);
    }

    await sleep(1100);
  }

  return details;
}

function applyMobulaAssetDetails(token, detail) {
  const asset = detail?.asset || detail?.data?.asset;
  if (!asset || typeof asset !== 'object') return false;

  const matchingToken = findMatchingDetailToken(detail, token.contract.address);

  token.name = pickString(asset, ['name']) || token.name;
  token.symbol = pickString(asset, ['symbol']) || token.symbol;
  token.logo =
    pickString(matchingToken || {}, ['logo', 'logoUrl', 'logo_url']) ||
    pickString(asset, ['logo', 'logoUrl', 'logo_url']) ||
    token.logo;
  token.description =
    sanitizePlainText(
      pickString(matchingToken || {}, ['description']) || pickString(asset, ['description']),
    ) || token.description;
  token.rank = pickNumber(asset, ['rank']) ?? token.rank;
  token.price = pickNumber(asset, ['priceUSD', 'price_usd']) ?? token.price;
  token.marketCap = pickNumber(asset, ['marketCapUSD', 'market_cap_usd']) ?? token.marketCap;
  token.fdv = pickNumber(asset, ['marketCapDilutedUSD', 'market_cap_diluted_usd']) ?? token.fdv;
  token.totalSupply = pickNumber(asset, ['totalSupply', 'total_supply']) ?? token.totalSupply;
  token.classificationTerms = [
    ...token.classificationTerms,
    ...extractClassificationTerms(asset),
    ...extractClassificationTerms(matchingToken),
  ];

  const listedAt = pickDate(asset, ['listedAt', 'listed_at']);
  const createdAt = pickDate(asset, ['createdAt', 'created_at']);
  const nextLaunchDate = listedAt || createdAt || token.launchDate;
  const hadLaunchDate = Boolean(token.launchDate);
  token.launchDate = nextLaunchDate;

  const before = JSON.stringify(token.projectLinks);
  token.projectLinks = {
    ...token.projectLinks,
    ...extractProjectLinks(asset),
    ...extractProjectLinks(matchingToken),
  };

  return (
    (!hadLaunchDate && Boolean(nextLaunchDate)) || before !== JSON.stringify(token.projectLinks)
  );
}

function pickSaneMarketDetailNumber(token, field, candidate) {
  if (candidate === null || candidate === undefined) return token[field];
  if (!Number.isFinite(candidate)) return token[field];
  if (candidate < 0) return token[field];

  if (field === 'price' && candidate > MAX_IMPORT_PRICE_USD) return token[field];
  if (field === 'marketCap' && candidate > MAX_IMPORT_MARKET_CAP_USD) return token[field];
  if (field === 'fdv' && candidate > MAX_IMPORT_FDV_USD) return token[field];

  const current = token[field];
  if (field === 'price' && Number.isFinite(current) && current > 0 && candidate > 0) {
    const ratio = candidate / current;
    if (ratio > MAX_MARKET_DETAIL_PRICE_RATIO || ratio < 1 / MAX_MARKET_DETAIL_PRICE_RATIO) {
      return token[field];
    }
  }

  return candidate;
}

function hasSaneImportMarketValues(token) {
  if (!Number.isFinite(token.price) || token.price <= 0 || token.price > MAX_IMPORT_PRICE_USD) {
    return false;
  }

  if (
    !Number.isFinite(token.marketCap) ||
    token.marketCap <= 0 ||
    token.marketCap > MAX_IMPORT_MARKET_CAP_USD
  ) {
    return false;
  }

  if (Number.isFinite(token.fdv) && token.fdv > MAX_IMPORT_FDV_USD) return false;

  return true;
}

function applyMobulaMetadata(token, metadata) {
  if (!metadata || typeof metadata !== 'object') return false;

  const before = JSON.stringify({
    name: token.name,
    symbol: token.symbol,
    logo: token.logo,
    description: token.description,
    price: token.price,
    marketCap: token.marketCap,
    fdv: token.fdv,
    liquidity: token.liquidity,
    volume: token.volume,
    totalSupply: token.totalSupply,
    launchDate: token.launchDate,
    projectLinks: token.projectLinks,
  });

  token.name = pickString(metadata, ['name']) || token.name;
  token.symbol = pickString(metadata, ['symbol']) || token.symbol;
  token.logo = pickString(metadata, ['logo', 'logoUrl', 'logo_url']) || token.logo;
  token.description = sanitizePlainText(pickString(metadata, ['description'])) || token.description;
  token.price = pickNumber(metadata, ['price']) ?? token.price;
  token.marketCap = pickNumber(metadata, ['market_cap', 'marketCap']) ?? token.marketCap;
  token.liquidity = pickNumber(metadata, ['liquidity']) ?? token.liquidity;
  token.volume = pickNumber(metadata, ['volume', 'volume24h', 'volume_24h']) ?? token.volume;
  token.totalSupply = pickNumber(metadata, ['total_supply', 'totalSupply']) ?? token.totalSupply;
  token.fdv = pickNumber(metadata, ['fully_diluted_valuation', 'fdv']) ?? token.fdv;
  token.rank = pickNumber(metadata, ['rank']) ?? token.rank;
  token.launchDate = pickDate(metadata, ['listed_at', 'listedAt']) || token.launchDate;
  token.projectLinks = {
    ...token.projectLinks,
    ...extractProjectLinks(metadata),
  };
  token.dexscreenerListed =
    pickOptionalBoolean(metadata, ['dexscreenerListed', 'dexscreener_listed']) ??
    token.dexscreenerListed;

  return (
    before !==
    JSON.stringify({
      name: token.name,
      symbol: token.symbol,
      logo: token.logo,
      description: token.description,
      price: token.price,
      marketCap: token.marketCap,
      fdv: token.fdv,
      liquidity: token.liquidity,
      volume: token.volume,
      totalSupply: token.totalSupply,
      launchDate: token.launchDate,
      projectLinks: token.projectLinks,
    })
  );
}

function findTargetContract(item) {
  const blockchains = pickStringArray(item, ['blockchains']);
  const contracts = pickStringArray(item, ['contracts']);

  for (let index = 0; index < blockchains.length; index += 1) {
    const chain = matchChain(blockchains[index]);
    const address = contracts[index]?.trim();
    if (chain && address) return { blockchain: blockchains[index], address, chain };
  }

  return null;
}

function buildGeckoTerminalTronToken(row) {
  const attributes = row?.attributes;
  if (!attributes || typeof attributes !== 'object') return null;

  const address = pickString(attributes, ['address']);
  if (!address || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim())) return null;

  const symbol = pickString(attributes, ['symbol']) || '???';
  if (symbolDenylist.has(symbol.toUpperCase())) return null;

  return {
    mobulaId: null,
    geckoTerminalId: typeof row?.id === 'string' ? row.id : null,
    name: pickString(attributes, ['name']) || 'Unknown',
    symbol,
    logo: pickGeckoTerminalImageUrl(attributes),
    description: sanitizePlainText(pickString(attributes, ['description'])),
    classificationTerms: [
      ...extractClassificationTerms(attributes),
      ...pickStringArray(attributes, ['gt_categories_id']),
      ...pickStringArray(attributes, ['gt_category_ids']),
    ],
    category: 'Other',
    price: null,
    marketCap: null,
    fdv: null,
    volume: null,
    change24h: null,
    liquidity: null,
    totalSupply: null,
    holdersCount: pickInteger(attributes.holders || {}, ['count']),
    rank: null,
    contract: {
      blockchain: GECKOTERMINAL_TRON_NETWORK,
      address: address.trim(),
      chain: 'tron',
    },
    chartUrl: chartUrlBuilders.tron(address.trim()),
    dexUrl: '',
    launchDate: null,
    projectLinks: extractGeckoTerminalProjectLinks(attributes),
  };
}

function buildToken(item) {
  const contract = findTargetContract(item);
  if (!contract) return null;

  const price = pickNumber(item, ['price']);
  if (price !== null && price <= 0) return null;

  const marketCap = pickNumber(item, ['market_cap', 'marketCap']);
  if (marketCap !== null && marketCap <= 0) return null;

  const symbol = pickString(item, ['symbol']) || '???';
  if (symbolDenylist.has(symbol.toUpperCase())) return null;

  const rank = pickNumber(item, ['rank']);
  if (EXCLUDE_TOP_RANK > 0 && rank !== null && rank <= EXCLUDE_TOP_RANK) return null;

  return {
    mobulaId: pickNumber(item, ['id']),
    name: pickString(item, ['name']) || 'Unknown',
    symbol,
    logo: pickString(item, ['logo', 'logoUrl', 'logo_url']),
    description: sanitizePlainText(pickString(item, ['description'])),
    classificationTerms: extractClassificationTerms(item),
    category: 'Other',
    price,
    marketCap,
    fdv: pickNumber(item, ['market_cap_diluted', 'marketCapDiluted', 'fully_diluted_valuation']),
    volume: pickNumber(item, ['volume', 'volume24h', 'volume_24h']),
    change24h: pickNumber(item, ['price_change_24h', 'priceChange24h']),
    liquidity: pickNumber(item, ['liquidity']),
    totalSupply: pickNumber(item, ['total_supply', 'totalSupply']),
    holdersCount: pickInteger(item, ['holders_count', 'holdersCount']),
    rank,
    contract,
    chartUrl: '',
    dexUrl: '',
    launchDate: pickDate(item, ['listed_at', 'listedAt', 'launch_date', 'launchDate']),
    projectLinks: extractProjectLinks(item),
  };
}

async function upsertToken(token, slug) {
  if (!db) throw new Error('DATABASE_URL is required.');
  const logoUrl = await resolveLogoUrl(token);

  await db.begin(async (tx) => {
    const existing = await tx`
      select id
      from coins
      where lower(chain) = lower(${token.contract.chain})
        and lower(contract_address) = lower(${token.contract.address})
      limit 1
    `;
    const coinId = existing[0]?.id || (await readNextCoinId(tx));
    const now = new Date();
    const submittedAt = randomSubmittedAt(now);

    await tx`
      insert into coins (
        id, slug, name, symbol, logo_url, description, category, chain, contract_address,
        launch_date, listing_source, listing_status, is_presale, submitted_at, created_at, updated_at
      )
      values (
        ${coinId}, ${slug}, ${token.name}, ${token.symbol}, ${logoUrl}, ${token.description},
        ${token.category}, ${token.contract.chain}, ${token.contract.address}, ${token.launchDate},
        'imported', 'active', false, ${submittedAt}, ${now}, ${now}
      )
      on conflict (id) do update set
        name = excluded.name,
        symbol = excluded.symbol,
        logo_url = excluded.logo_url,
        description = excluded.description,
        chain = excluded.chain,
        contract_address = excluded.contract_address,
        launch_date = excluded.launch_date,
        listing_source = excluded.listing_source,
        listing_status = excluded.listing_status,
        is_presale = excluded.is_presale,
        updated_at = excluded.updated_at
    `;

    await tx`
      insert into market_snapshots (
        coin_id, price_usd, market_cap_usd, volume_24h_usd, change_24h,
        liquidity_usd, fdv_usd, total_supply, holders_count, market_rank, recorded_at
      )
      values (
        ${coinId}, ${toDbNumber(token.price)}, ${toDbNumber(token.marketCap)},
        ${toDbNumber(token.volume)}, ${toDbNumber(token.change24h)}, ${toDbNumber(token.liquidity)},
        ${toDbNumber(token.fdv)}, ${toDbNumber(token.totalSupply)}, ${token.holdersCount},
        ${token.rank}, ${now}
      )
    `;

    await upsertMarketSource(tx, coinId, token, now);

    await upsertCoinLink(tx, coinId, 'dex', token.dexUrl, now);
    if (token.chartUrl) await upsertCoinLink(tx, coinId, 'chart', token.chartUrl, now);
    await upsertProjectLinks(tx, coinId, token.projectLinks, now);

    return coinId;
  });
}

async function resolveLogoUrl(token) {
  if (!token.logo || SKIP_R2_LOGO_UPLOAD) return token.logo || null;

  try {
    const uploaded = await mirrorRemoteImageToR2(token.logo, {
      chain: token.contract.chain,
    });
    return uploaded.url;
  } catch (error) {
    throw new Error(
      `Could not mirror logo to R2 for ${token.symbol}. ${
        error instanceof Error ? error.message : ''
      }`,
    );
  }
}

function randomSubmittedAt(now) {
  const earliest = Math.min(IMPORT_SUBMITTED_AT_START.getTime(), now.getTime());
  const latest = now.getTime();

  if (earliest >= latest) return new Date(latest);

  return new Date(earliest + Math.floor(Math.random() * (latest - earliest)));
}

async function readNextCoinId(tx) {
  const rows = await tx`select coalesce(max(id), 999) + 1 as next_id from coins`;
  return rows[0].nextId;
}

async function upsertMarketSource(tx, coinId, token, now) {
  const externalId = marketSourceExternalId(token);
  if (!externalId) return;
  const provider = token.contract.chain === 'tron' ? 'geckoterminal' : 'mobula';

  await tx`
    insert into market_sources (
      coin_id, provider, external_id, source_image_url, last_market_sync_at,
      last_error_code, last_error_message, last_error_at, failure_count, next_attempt_at,
      created_at, updated_at
    )
    values (
      ${coinId}, ${provider}, ${externalId}, ${token.logo || null}, ${now},
      null, null, null, 0, null, ${now}, ${now}
    )
    on conflict (coin_id, provider) do update set
      external_id = excluded.external_id,
      source_image_url = excluded.source_image_url,
      last_market_sync_at = excluded.last_market_sync_at,
      last_error_code = null,
      last_error_message = null,
      last_error_at = null,
      failure_count = 0,
      next_attempt_at = null,
      updated_at = excluded.updated_at
  `;
}

async function upsertCoinLink(tx, coinId, type, url, now) {
  const safeUrl = normalizeUrl(url);
  if (!safeUrl) return;

  await tx`
    insert into coin_links (coin_id, type, url, created_at, updated_at)
    values (${coinId}, ${type}, ${safeUrl}, ${now}, ${now})
    on conflict (coin_id, type) do update set
      url = excluded.url,
      updated_at = excluded.updated_at
  `;
}

async function upsertProjectLinks(tx, coinId, links, now) {
  for (const [type, url] of Object.entries(links || {})) {
    await upsertCoinLink(tx, coinId, type, url, now);
  }
}

async function loadExistingImportState() {
  const empty = { slugs: new Set(), contracts: new Set(), marketSourceIds: new Set() };
  if (!db) return empty;

  const [coinRows, sourceRows] = await Promise.all([
    db`
      select slug, chain, contract_address
      from coins
    `,
    db`
      select provider, external_id
      from market_sources
      where provider in ('mobula', 'geckoterminal')
    `,
  ]);

  return {
    slugs: new Set(coinRows.map((row) => row.slug).filter(Boolean)),
    contracts: new Set(
      coinRows.map((row) => contractKey(row.chain, row.contractAddress)).filter(Boolean),
    ),
    marketSourceIds: new Set(sourceRows.map((row) => row.externalId).filter(Boolean)),
  };
}

function isExistingTokenCandidate(
  token,
  existingState,
  candidateState = { contracts: new Set(), marketSourceIds: new Set() },
) {
  const key = contractKey(token.contract.chain, token.contract.address);
  const sourceId = marketSourceExternalId(token);

  return Boolean(
    (key && (existingState.contracts.has(key) || candidateState.contracts.has(key))) ||
    (sourceId &&
      (existingState.marketSourceIds.has(sourceId) ||
        candidateState.marketSourceIds.has(sourceId))),
  );
}

function filterNewTokens(tokens, existingState) {
  const seenContracts = new Set();
  const seenSources = new Set();
  let skippedExisting = 0;
  let skippedBatchDuplicate = 0;

  const freshTokens = tokens.filter((token) => {
    const key = contractKey(token.contract.chain, token.contract.address);
    const sourceId = marketSourceExternalId(token);

    if (key && existingState.contracts.has(key)) {
      skippedExisting += 1;
      return false;
    }

    if (sourceId && existingState.marketSourceIds.has(sourceId)) {
      skippedExisting += 1;
      return false;
    }

    if ((key && seenContracts.has(key)) || (sourceId && seenSources.has(sourceId))) {
      skippedBatchDuplicate += 1;
      return false;
    }

    if (key) seenContracts.add(key);
    if (sourceId) seenSources.add(sourceId);
    return true;
  });

  return { freshTokens, skippedExisting, skippedBatchDuplicate };
}

function selectNewPopularCandidatePool(tokens) {
  const candidates = tokens.filter(couldBecomeNewPopularToken).sort(compareNewPopularTokens);
  const maxCandidates = Math.max(TARGET_COUNT, TARGET_COUNT * NEW_POPULAR_OVERSAMPLE_FACTOR);
  return candidates.slice(0, maxCandidates);
}

function couldBecomeNewPopularToken(token) {
  if (!hasPopularitySignal(token)) return false;
  if (!token.launchDate) return true;
  return isRecentLaunchDate(token.launchDate);
}

function isNewPopularToken(token) {
  return Boolean(
    token.launchDate && isRecentLaunchDate(token.launchDate) && hasPopularitySignal(token),
  );
}

function isRecentLaunchDate(date) {
  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return false;

  const now = Date.now();
  if (timestamp > now) return false;

  const ageDays = (now - timestamp) / 86_400_000;
  return ageDays <= NEW_POPULAR_MAX_AGE_DAYS && ageDays <= NEW_POPULAR_EXCLUDE_OLDER_THAN_DAYS;
}

function hasPopularitySignal(token) {
  const rank = Number.isFinite(token.rank) ? token.rank : Infinity;
  const volume = Number.isFinite(token.volume) ? token.volume : 0;
  const liquidity = Number.isFinite(token.liquidity) ? token.liquidity : 0;

  return (
    rank <= NEW_POPULAR_MAX_RANK ||
    volume >= NEW_POPULAR_MIN_VOLUME_USD ||
    liquidity >= NEW_POPULAR_MIN_LIQUIDITY_USD
  );
}

function compareNewPopularTokens(a, b) {
  const aDate = a.launchDate instanceof Date ? a.launchDate.getTime() : 0;
  const bDate = b.launchDate instanceof Date ? b.launchDate.getTime() : 0;
  if (aDate !== bDate) return bDate - aDate;

  const aRank = Number.isFinite(a.rank) ? a.rank : Infinity;
  const bRank = Number.isFinite(b.rank) ? b.rank : Infinity;
  if (aRank !== bRank) return aRank - bRank;

  const aVolume = Number.isFinite(a.volume) ? a.volume : 0;
  const bVolume = Number.isFinite(b.volume) ? b.volume : 0;
  if (aVolume !== bVolume) return bVolume - aVolume;

  return a.name.localeCompare(b.name);
}

function daysSinceStartOfYear() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  return Math.max(1, Math.ceil((Date.now() - start) / 86_400_000));
}

function contractKey(chain, address) {
  const safeChain = String(chain || '')
    .trim()
    .toLowerCase();
  const safeAddress = normalizeContractAddress(address);
  return safeChain && safeAddress ? `${safeChain}:${safeAddress}` : '';
}

function marketSourceExternalId(token) {
  const chainId = mobulaMarketSourceIds[token.contract.chain];
  const address = token.contract.address?.trim();
  return chainId && address ? `${chainId}:${address}` : '';
}

function normalizeContractAddress(address) {
  return String(address || '')
    .trim()
    .toLowerCase();
}

function uniqueSlug(base, taken) {
  const safeBase = base || 'token';
  let slug = safeBase;
  let index = 2;

  while (taken.has(slug)) {
    slug = `${safeBase}-${index}`;
    index += 1;
  }

  taken.add(slug);
  return slug;
}

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function randomSplit(total, keys, available) {
  const weights = keys.map(() => Math.random() + 0.1);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const split = Object.fromEntries(
    keys.map((key, index) => [
      key,
      Math.min(available[key], Math.round((weights[index] / weightSum) * total)),
    ]),
  );

  let assigned = keys.reduce((sum, key) => sum + split[key], 0);
  let guard = 0;

  while (assigned !== total && guard < 10_000) {
    guard += 1;

    if (assigned < total) {
      const candidates = keys.filter((key) => split[key] < available[key]);
      if (!candidates.length) break;
      split[randomItem(candidates)] += 1;
      assigned += 1;
    } else {
      const candidates = keys.filter((key) => split[key] > 0);
      if (!candidates.length) break;
      split[randomItem(candidates)] -= 1;
      assigned -= 1;
    }
  }

  return split;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function logCategorySummary(tokens) {
  const counts = tokens.reduce((summary, token) => {
    summary[token.category] = (summary[token.category] || 0) + 1;
    return summary;
  }, {});

  log(
    `Category inference: ${Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => `${category}=${count}`)
      .join(', ')}`,
  );
}

function inferCoinCategory(token) {
  const searchText = buildCategorySearchText(token);
  if (!searchText) return 'Other';

  const scores = new Map();
  for (const [category, groups] of Object.entries(categoryKeywordMap)) {
    let score = 0;
    score += scoreKeywords(searchText, groups.strong, 6);
    score += scoreKeywords(searchText, groups.medium, 3);
    score += scoreKeywords(searchText, groups.light, 1);
    if (score > 0) scores.set(category, score);
  }

  if (!scores.size) return 'Other';

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [winner, winnerScore] = ranked[0];
  const runnerUpScore = ranked[1]?.[1] || 0;

  if (winnerScore < 3) return 'Other';
  if (winnerScore < 6 && runnerUpScore > 0) return 'Other';
  if (runnerUpScore > 0 && winnerScore - runnerUpScore < 2) return 'Other';

  return winner;
}

function scoreKeywords(searchText, keywords, weight) {
  return keywords.reduce((score, keyword) => {
    const matches = searchText.match(keywordPattern(keyword));
    return score + (matches?.length || 0) * weight;
  }, 0);
}

function keywordPattern(keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'gi');
}

function buildCategorySearchText(token) {
  return [
    token.name,
    token.symbol,
    token.description,
    ...(token.classificationTerms || []),
    ...Object.values(token.projectLinks || {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function extractClassificationTerms(source) {
  if (!source || typeof source !== 'object') return [];

  return [
    ...pickStringArray(source, ['tags']),
    ...pickStringArray(source, ['categories']),
    ...pickStringArray(source, ['category']),
    ...pickStringArray(source, ['sectors']),
    ...pickStringArray(source, ['sector']),
    ...pickStringArray(source, ['narratives']),
    ...pickStringArray(source, ['narrative']),
    pickString(source, ['category', 'sector', 'narrative']),
  ]
    .filter(Boolean)
    .map((value) => sanitizePlainText(String(value)))
    .filter(Boolean);
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function pickNumber(obj, keys) {
  const value = pick(obj, keys);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pickInteger(obj, keys) {
  const value = pickNumber(obj, keys);
  return Number.isSafeInteger(value) ? value : null;
}

function pickOptionalBoolean(obj, keys) {
  const value = pick(obj, keys);
  return typeof value === 'boolean' ? value : null;
}

function pickString(obj, keys) {
  const value = pick(obj, keys);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pickDate(obj, keys) {
  const value = pick(obj, keys);
  if (typeof value !== 'string' && typeof value !== 'number') return null;

  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pickStringArray(obj, keys) {
  const value = pick(obj, keys);
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function findMatchingDetailToken(detail, address) {
  const tokens = Array.isArray(detail?.tokens)
    ? detail.tokens
    : Array.isArray(detail?.data?.tokens)
      ? detail.data.tokens
      : [];
  const normalizedAddress = address.toLowerCase();

  return (
    tokens.find((token) => {
      const tokenAddress = pickString(token, ['address', 'contractAddress', 'contract_address']);
      return tokenAddress?.toLowerCase() === normalizedAddress;
    }) || tokens[0]
  );
}

function buildDexSwapUrl(token) {
  const builder = dexSwapUrlBuilders[token.contract.chain];
  return builder ? builder(token.contract.address, token) : '';
}

function isDexScreenerChartUrl(url) {
  return typeof url === 'string' && url.includes('dexscreener.com');
}

function isSupportedExchange(chain, exchangeName) {
  const matchers = supportedExchangeMatchers[chain] || [];
  if (!exchangeName) return false;
  if (!matchers.length) return false;
  return matchers.some((matcher) => matcher.test(exchangeName));
}

function canUseDexScreenerChart(token, { pairAddress, dexscreenerListed }) {
  if (!chartUrlBuilders[token.contract.chain]) return false;
  if (dexscreenerListed === true || token.dexscreenerListed === true) return true;
  if (dexscreenerListed === false || token.dexscreenerListed === false) return false;
  return Boolean(pairAddress);
}

function findChartUrl(details) {
  return firstUrl('market', [
    pickString(details, [
      'chartUrl',
      'chart_url',
      'marketUrl',
      'market_url',
      'pairUrl',
      'pair_url',
    ]),
    pickString(details.exchange || {}, [
      'chartUrl',
      'chart_url',
      'marketUrl',
      'market_url',
      'pairUrl',
      'pair_url',
    ]),
    findNestedUrl(details, [
      'chartUrl',
      'chart_url',
      'marketUrl',
      'market_url',
      'pairUrl',
      'pair_url',
    ]),
  ]);
}

function findDexUrl(details) {
  return firstUrl('market', [
    pickString(details, ['tradeUrl', 'trade_url', 'swapUrl', 'swap_url', 'dexUrl', 'dex_url']),
    pickString(details.exchange || {}, [
      'tradeUrl',
      'trade_url',
      'swapUrl',
      'swap_url',
      'dexUrl',
      'dex_url',
    ]),
    findNestedUrl(details, ['tradeUrl', 'trade_url', 'swapUrl', 'swap_url', 'dexUrl', 'dex_url']),
  ]);
}

function extractProjectLinks(source) {
  if (!source || typeof source !== 'object') return {};

  const socials = source.socials && typeof source.socials === 'object' ? source.socials : {};
  const others = socials.others && typeof socials.others === 'object' ? socials.others : {};

  return compactObject({
    website: firstUrl('website', [
      pickString(socials, ['website', 'site', 'homepage', 'home']),
      pickString(source, ['website', 'site', 'homepage', 'home']),
      findNestedUrl(others, ['website', 'site', 'homepage', 'official']),
    ]),
    telegram: firstUrl('telegram', [
      pickString(socials, ['telegram', 'chat']),
      pickString(source, ['telegram', 'chat']),
      findNestedUrl(others, ['telegram', 'tg', 'chat']),
    ]),
    x: firstUrl('x', [
      pickString(socials, ['twitter', 'x']),
      pickString(source, ['twitter', 'x']),
      findNestedUrl(others, ['twitter', 'x']),
    ]),
    discord: firstUrl('discord', [
      pickString(socials, ['discord']),
      pickString(source, ['discord']),
      findNestedUrl(others, ['discord']),
    ]),
    github: firstUrl('github', [
      pickString(socials, ['github']),
      pickString(source, ['github']),
      findNestedUrl(others, ['github', 'repo', 'repository']),
    ]),
    whitepaper: firstUrl('whitepaper', [
      pickString(socials, ['whitepaper', 'whitePaper', 'docs', 'documentation']),
      pickString(source, ['whitepaper', 'whitePaper', 'docs', 'documentation']),
      findNestedUrl(others, ['whitepaper', 'whitePaper', 'docs', 'documentation', 'litepaper']),
    ]),
    kyc: firstUrl('kyc', [
      pickString(socials, ['kyc']),
      pickString(source, ['kyc']),
      findNestedUrl(others, ['kyc']),
    ]),
    audit: firstUrl('audit', [
      pickString(socials, ['audit']),
      pickString(source, ['audit']),
      findNestedUrl(others, ['audit', 'security']),
    ]),
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

  const withProtocol =
    /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) || trimmed.startsWith('mailto:')
      ? trimmed
      : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return '';
    if (url.protocol !== 'mailto:' && !url.hostname.includes('.')) return '';
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

function findNestedUrl(value, needles, depth = 0) {
  if (!value || depth > 3) return '';

  if (typeof value === 'string') {
    return normalizeUrl(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findNestedUrl(item, needles, depth + 1);
      if (nested) return nested;
    }
    return '';
  }

  if (typeof value !== 'object') return '';

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (needles.some((needle) => normalizedKey.includes(needle.toLowerCase()))) {
      const nested = findNestedUrl(nestedValue, needles, depth + 1);
      if (nested) return nested;
    }
  }

  return '';
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => typeof item === 'string' && item.trim()),
  );
}

function mobulaAuthHeaders() {
  const apiKey = getNextMobulaApiKey();
  return apiKey ? { Authorization: apiKey } : {};
}

function getNextMobulaApiKey() {
  const keys = getMobulaApiKeys();
  if (!keys.length) return '';

  const index = mobulaApiKeyIndex;
  mobulaApiKeyIndex = (index + 1) % keys.length;

  return keys[index % keys.length];
}

function getMobulaApiKeys() {
  return uniqueStrings([
    ...splitEnvList(process.env.MOBULA_API_KEYS),
    ...splitEnvList(process.env.MOBULA_API_KEY),
  ]);
}

function splitEnvList(value) {
  return (value || '')
    .split(/[\n,]/)
    .map((key) => key.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return Array.from(new Set(values));
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

async function mirrorRemoteImageToR2(sourceUrl, { chain }) {
  const storage = getR2Config();
  const image = await fetchRemoteImage(sourceUrl);
  const extension = extensionForMime(image.mimeType);
  const key = `${chain}/logos/${randomUUID()}.${extension}`;
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
  const parsedUrl = new URL(requestUrl);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const signedHeaders = cacheControl
    ? 'cache-control;content-type;host;x-amz-content-sha256;x-amz-date'
    : 'content-type;host;x-amz-content-sha256;x-amz-date';
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalRequest = [
    'PUT',
    parsedUrl.pathname,
    parsedUrl.searchParams.toString(),
    ...(cacheControl ? [`cache-control:${cacheControl}`] : []),
    `content-type:${contentType}`,
    `host:${parsedUrl.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
    signedHeaders,
    payloadHash,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = hmacHex(getSigningKey(storage.secretAccessKey, dateStamp), stringToSign);

  return {
    ...(cacheControl ? { 'Cache-Control': cacheControl } : {}),
    Authorization: [
      `AWS4-HMAC-SHA256 Credential=${storage.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', '),
    'Content-Type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
}

function getSigningKey(secretAccessKey, dateStamp) {
  const dateKey = hmacBuffer(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmacBuffer(dateKey, 'auto');
  const serviceKey = hmacBuffer(regionKey, 's3');
  return hmacBuffer(serviceKey, 'aws4_request');
}

function objectRequestUrl(endpoint, bucket, key) {
  const url = new URL(`${trimTrailingSlash(endpoint)}/`);
  url.pathname = joinPath(url.pathname, bucket, key);
  return url.toString();
}

function publicObjectUrl(baseUrl, key) {
  const url = new URL(`${trimTrailingSlash(baseUrl)}/`);
  url.pathname = joinPath(url.pathname, key);
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

function extensionForMime(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/g, '');
}

function r2EndpointFromAccountId(accountId) {
  return accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '';
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

function toDbNumber(value) {
  return Number.isFinite(value) ? String(value) : null;
}

function readPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

async function main() {
  log('Mobula import has started');

  const existingState = await loadExistingImportState();
  if (db) {
    log(
      `Loaded ${existingState.slugs.size} slug(s), ${existingState.contracts.size} contract(s), and ${existingState.marketSourceIds.size} market source key(s) from the database.`,
    );
  } else {
    log('No database configured for this dry run, so existing imported coins cannot be filtered.');
  }

  const raw = await fetchMobulaAssets();
  const mobulaCandidates = raw.map(buildToken).filter(Boolean);
  const mobulaFreshResult = filterNewTokens(mobulaCandidates, existingState);
  let matchedFresh = mobulaFreshResult.freshTokens;
  let skippedExisting = mobulaFreshResult.skippedExisting;
  let skippedBatchDuplicate = mobulaFreshResult.skippedBatchDuplicate;
  let geckoTerminalTronFallbackCandidates = [];

  const freshTronCount = matchedFresh.filter((token) => token.contract.chain === 'tron').length;
  if (freshTronCount < GECKOTERMINAL_TRON_FALLBACK_MIN) {
    geckoTerminalTronFallbackCandidates = await fetchGeckoTerminalTronFallbackTokens(
      existingState,
      mobulaCandidates,
    );
    const geckoFreshResult = filterNewTokens(geckoTerminalTronFallbackCandidates, {
      ...existingState,
      contracts: new Set([
        ...existingState.contracts,
        ...matchedFresh
          .map((token) => contractKey(token.contract.chain, token.contract.address))
          .filter(Boolean),
      ]),
      marketSourceIds: new Set([
        ...existingState.marketSourceIds,
        ...matchedFresh.map((token) => marketSourceExternalId(token)).filter(Boolean),
      ]),
    });
    matchedFresh = [...matchedFresh, ...geckoFreshResult.freshTokens];
    skippedExisting += geckoFreshResult.skippedExisting;
    skippedBatchDuplicate += geckoFreshResult.skippedBatchDuplicate;
  }

  const matchedAll = [...mobulaCandidates, ...geckoTerminalTronFallbackCandidates];

  const candidatePool = NEW_POPULAR_ONLY
    ? selectNewPopularCandidatePool(matchedFresh)
    : matchedFresh;

  const byChain = Object.fromEntries(chainKeys.map((chain) => [chain, []]));
  for (const token of candidatePool) byChain[token.contract.chain].push(token);

  const available = Object.fromEntries(chainKeys.map((chain) => [chain, byChain[chain].length]));
  const emptyChains = chainKeys.filter((chain) => available[chain] === 0);
  if (emptyChains.length) {
    console.warn(
      `[+${formatDuration(Date.now() - scriptStartTime)}] ⚠ No eligible tokens found for: ${emptyChains.join(', ')}`,
    );
  }

  log(
    `Pool: raw ${raw.length} → eligible ${matchedAll.length} → fresh ${matchedFresh.length} → candidates ${candidatePool.length}; skipped existing ${skippedExisting}, batch dupes ${skippedBatchDuplicate}.`,
  );

  const selectionTarget = NEW_POPULAR_ONLY
    ? Math.min(
        candidatePool.length,
        Math.max(TARGET_COUNT, TARGET_COUNT * NEW_POPULAR_OVERSAMPLE_FACTOR),
      )
    : TARGET_COUNT;
  const perChainCount = randomSplit(selectionTarget, chainKeys, available);
  const selectedByChain = chainKeys.flatMap((chain) => {
    const pool = NEW_POPULAR_ONLY
      ? [...byChain[chain]].sort(compareNewPopularTokens)
      : RANDOMIZE
        ? shuffle(byChain[chain])
        : [...byChain[chain]].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    return pool.slice(0, perChainCount[chain]);
  });
  let tokens = NEW_POPULAR_ONLY
    ? selectedByChain.sort(compareNewPopularTokens)
    : RANDOMIZE
      ? shuffle(selectedByChain)
      : selectedByChain;

  if (tokens.length < selectionTarget) {
    console.warn(
      `[+${formatDuration(Date.now() - scriptStartTime)}] ⚠ Only ${tokens.length}/${selectionTarget} tokens available — some chains ran out of eligible tokens.`,
    );
  }

  logSection('Import plan');
  if (NEW_POPULAR_ONLY) {
    log(
      `Plan: ${DRY_RUN ? 'preview' : 'write'} up to ${TARGET_COUNT} new-popular tokens after checking ${tokens.length}/${selectionTarget} candidates`,
    );
    log(`Filters: this-year age, no >2y, rank > ${EXCLUDE_TOP_RANK}`);
  } else {
    log(`Plan: ${DRY_RUN ? 'preview' : 'write'} ${tokens.length}/${selectionTarget} random tokens`);
    log(`Filters: rank > ${EXCLUDE_TOP_RANK}`);
  }
  log(`Chains: ${chainKeys.map((chain) => `${chain}=${perChainCount[chain]}`).join(', ')}`);
  log('Chart and DEX links will be added only when market data confirms a usable route.');

  await enrichTokensWithMobulaDetails(tokens);
  await enrichTokensWithMobulaMetadata(tokens);
  await enrichTokensWithGeckoTerminalInfo(tokens);
  await enrichTokensWithMobulaMarketDetails(tokens);
  await enrichTokensWithGeckoTerminalMarketDetails(tokens);

  if (NEW_POPULAR_ONLY) {
    const enrichedCount = tokens.length;
    tokens = tokens.filter(isNewPopularToken).sort(compareNewPopularTokens).slice(0, TARGET_COUNT);
    log(
      `Final selection: ${tokens.length}/${TARGET_COUNT} tokens kept from ${enrichedCount} checked`,
    );
  }

  const saneTokens = tokens.filter(hasSaneImportMarketValues);
  const suspiciousTokens = tokens.filter((token) => !hasSaneImportMarketValues(token));
  if (suspiciousTokens.length) {
    console.warn(
      `[+${formatDuration(Date.now() - scriptStartTime)}] ⚠ Skipping ${suspiciousTokens.length} suspicious token(s) with impossible market values: ${suspiciousTokens
        .slice(0, 12)
        .map(
          (token) =>
            `${token.symbol} (${token.name}, price=${token.price}, marketCap=${token.marketCap})`,
        )
        .join('; ')}${suspiciousTokens.length > 12 ? '; …' : ''}`,
    );
  }

  saneTokens.forEach((token) => {
    token.category = inferCoinCategory(token);
  });
  logCategorySummary(saneTokens);

  if (DRY_RUN) {
    logSection(
      `Dry run: previewing ${saneTokens.length} enriched token(s) — no rows will be written`,
    );
    console.table(
      saneTokens.map((token) => ({
        mobulaId: token.mobulaId,
        chain: token.contract.chain,
        symbol: token.symbol,
        name: token.name,
        category: token.category,
        price: token.price,
        marketCap: token.marketCap,
        fdv: token.fdv,
        liquidity: token.liquidity,
        holders: token.holdersCount,
        rank: token.rank,
        launchDate: token.launchDate?.toISOString().slice(0, 10) || null,
        website: token.projectLinks.website || null,
        telegram: token.projectLinks.telegram || null,
        x: token.projectLinks.x || null,
        discord: token.projectLinks.discord || null,
        github: token.projectLinks.github || null,
        whitepaper: token.projectLinks.whitepaper || null,
        kyc: token.projectLinks.kyc || null,
        audit: token.projectLinks.audit || null,
        pair: token.chartPairAddress || null,
        exchange: token.marketExchangeName || null,
        supportedExchange: token.marketExchangeSupported ?? null,
        chartUrl: token.chartUrl,
        dexUrl: token.dexUrl,
        contract: token.contract.address,
      })),
    );
    log(
      `Dry run complete — no rows written. (Total time: ${formatDuration(Date.now() - scriptStartTime)})`,
    );
    return;
  }

  logSection(`Writing ${saneTokens.length} token(s) to the database`);
  const existingSlugs = existingState.slugs;

  let success = 0;
  let failed = 0;
  let current = 0;
  const writePhaseStartedAt = Date.now();

  for (const token of saneTokens) {
    current += 1;
    try {
      const slug = uniqueSlug(slugify(`${token.symbol}-${token.name}`), existingSlugs);
      await upsertToken(token, slug);
      success += 1;
      if (DEBUG) log(`✔ [${token.contract.chain}] ${token.symbol} (${token.name})`);
    } catch (error) {
      failed += 1;
      console.error(
        `[+${formatDuration(Date.now() - scriptStartTime)}] ✘ Failed to import ${token.symbol} [${token.contract.chain}]:`,
        error,
      );
    }

    logImportProgress(current, saneTokens.length, writePhaseStartedAt);
  }

  logSection(
    `Import finished: ${success} imported/updated, ${failed} failed, ${suspiciousTokens.length} suspicious skipped, out of ${tokens.length} total. ` +
      `Total run time: ${formatDuration(Date.now() - scriptStartTime)}.`,
  );
}

main()
  .catch((error) => {
    console.error(
      `[+${formatDuration(Date.now() - scriptStartTime)}] Fatal error — import stopped early:`,
      error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db?.end();
  });
