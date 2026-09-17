#!/usr/bin/env node

/**
 * Dev-only reset helper.
 *
 * Runs, in order:
 * - Redis FLUSHDB, when REDIS_URL is set
 * - app data cleanup
 * - dummy project and airdrop seed data
 *
 * Options:
 * - --redis-all: use Redis FLUSHALL instead of FLUSHDB
 * - --skip-redis: skip Redis cleanup
 * - --skip-seed: skip dummy data seeding
 */

import Redis from 'ioredis';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const PRESERVED_EMAIL = process.env.DEV_RESET_KEEP_USER_EMAIL?.trim();
const shouldFlushAllRedis = process.argv.includes('--redis-all');
const shouldSkipRedis = process.argv.includes('--skip-redis');
const shouldSkipSeed = process.argv.includes('--skip-seed');
const seedEmail = 'seed+airdrops@endorsecoin.local';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to reset data while NODE_ENV=production.');
}

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

const db = postgres(DATABASE_URL, {
  max: 1,
  transform: postgres.camel,
});

const projects = [
  ['nebulafi', 'NebulaFi', 'NEB', 'DeFi', '1'],
  ['glyph-markets', 'Glyph Markets', 'GLYPH', 'Trading', '1'],
  ['moonkit', 'MoonKit', 'MOONK', 'Meme', '56'],
  ['signalpad', 'SignalPad', 'SIG', 'Launchpad', '8453'],
  ['vaultly', 'Vaultly', 'VLT', 'DeFi', '42161'],
  ['emberswap', 'EmberSwap', 'EMBER', 'DEX', '137'],
  ['lumenx', 'LumenX', 'LMX', 'AI', '1'],
  ['prismfi', 'PrismFi', 'PRSM', 'DeFi', '10'],
  ['novalabs', 'NovaLabs', 'NOVA', 'Infrastructure', '1'],
  ['harbordao', 'HarborDAO', 'HBR', 'DAO', '8453'],
  ['echotrade', 'EchoTrade', 'ECHO', 'Trading', '42161'],
  ['zenithpay', 'ZenithPay', 'ZEN', 'Payments', '137'],
  ['pulsedex', 'PulseDEX', 'PLS', 'DEX', '56'],
  ['aurorabase', 'AuroraBase', 'AUR', 'Infrastructure', '8453'],
  ['riverfi', 'RiverFi', 'RVR', 'DeFi', '10'],
  ['pixelforge', 'PixelForge', 'PXF', 'Gaming', '1'],
];

const airdropSeeds = [
  [
    'orbitdrop-season-one',
    0,
    'OrbitDrop Season One',
    '250,000 NEB + partner NFTs',
    1200,
    -1,
    7,
    'active',
  ],
  [
    'glyph-early-supporter-rewards',
    1,
    'Glyph Early Supporter Rewards',
    '50 USDC each + whitelist spots',
    300,
    2,
    12,
    'scheduled',
  ],
  [
    'moonkit-community-sprint',
    2,
    'MoonKit Community Sprint',
    '1,000,000 MOONK shared pool',
    5000,
    -5,
    2,
    'active',
  ],
  [
    'signal-pass-claims',
    3,
    'Signal Pass Claims',
    '10,000 SIG shared pool',
    750,
    4,
    14,
    'scheduled',
  ],
  [
    'vault-points-round',
    4,
    'Vault Points Round',
    'Bonus points and beta access',
    2100,
    -3,
    3,
    'active',
  ],
  ['ember-allocation-drop', 5, 'Ember Allocation Drop', '300 EMBER each', 640, 9, 16, 'scheduled'],
  [
    'lumen-pass-allocation',
    6,
    'Lumen Pass Allocation',
    '500 LMX each + access pass',
    420,
    -1,
    5,
    'active',
  ],
  [
    'prism-holder-drop',
    7,
    'Prism Holder Drop',
    'Shared pool of 80,000 PRSM',
    1600,
    1,
    8,
    'scheduled',
  ],
  [
    'nova-mystery-box',
    8,
    'Nova Mystery Box',
    'Mystery boxes and token rewards',
    900,
    12,
    22,
    'scheduled',
  ],
  [
    'harbor-boost-rewards',
    9,
    'Harbor Boost Rewards',
    'Fee credits + HBR raffle entries',
    2500,
    15,
    24,
    'scheduled',
  ],
  [
    'echo-quest-drop',
    10,
    'Echo Quest Drop',
    '125,000 ECHO shared rewards',
    1100,
    -18,
    -4,
    'expired',
  ],
  [
    'zenith-minters-claim',
    11,
    'Zenith Minters Claim',
    'Mint rebates and ZEN bonuses',
    680,
    -29,
    -18,
    'expired',
  ],
  [
    'pulse-rewards-sprint',
    12,
    'Pulse Rewards Sprint',
    'Trading credits for active users',
    3300,
    3,
    10,
    'scheduled',
  ],
  [
    'aurora-list-rewards',
    13,
    'Aurora List Rewards',
    'Whitelist allocation and AUR pool',
    120,
    -1,
    4,
    'active',
  ],
  [
    'river-claim-week',
    14,
    'River Claim Week',
    'Gas rebates + RVR tickets',
    1400,
    -20,
    -7,
    'expired',
  ],
  [
    'arcade-quest-drop',
    15,
    'Arcade Quest Drop',
    'Rare badge NFTs + 75,000 PXF',
    888,
    -12,
    -2,
    'expired',
  ],
];

async function main() {
  await runStep('Redis cleanup', flushRedis);

  await db.begin(async (tx) => {
    const preservedUser = await findPreservedUser(tx);
    await resetData(tx, preservedUser);

    if (!shouldSkipSeed) {
      const airdropTableResult = await runDbStep(tx, 'airdrop_submissions table check', (stepTx) =>
        ensureAirdropTableExists(stepTx),
      );
      const seedProjectsResult = await runDbStep(tx, 'dummy project seed', (stepTx) =>
        seedProjects(stepTx),
      );

      if (airdropTableResult.ok && seedProjectsResult.ok) {
        await runDbStep(
          tx,
          'dummy airdrop cleanup',
          (stepTx) => stepTx`delete from airdrop_submissions where requester_email = ${seedEmail}`,
        );
        await runDbStep(tx, 'dummy airdrop seed', (stepTx) =>
          seedAirdrops(stepTx, seedProjectsResult.value),
        );
      } else {
        console.warn('Skipped dummy airdrop seed because required setup failed.');
      }
    }

    console.log(buildCompletionMessage(preservedUser));
    if (!shouldSkipSeed) {
      console.log(
        `Dummy seed complete. Added ${projects.length} projects and ${airdropSeeds.length} airdrops.`,
      );
    }
  });
}

async function runStep(label, action) {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    console.warn(`Skipped ${label}: ${formatError(error)}`);
    return { ok: false, error };
  }
}

async function runDbStep(tx, label, action) {
  return runStep(label, () => tx.savepoint((stepTx) => action(stepTx)));
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function flushRedis() {
  if (shouldSkipRedis) {
    console.log('Redis cleanup skipped.');
    return;
  }

  if (!REDIS_URL) {
    console.log('Redis cleanup skipped. REDIS_URL is not set.');
    return;
  }

  const redis = new Redis(REDIS_URL, {
    connectTimeout: 3000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  try {
    await redis.connect();
    if (shouldFlushAllRedis) {
      await redis.flushall();
      console.log('Redis FLUSHALL completed.');
    } else {
      await redis.flushdb();
      console.log('Redis FLUSHDB completed for the configured REDIS_URL database.');
    }
  } finally {
    redis.disconnect();
  }
}

async function resetData(tx, preservedUser) {
  const preservedUserId = preservedUser?.id ?? null;

  const deletedSubmissionIdsResult = await runDbStep(
    tx,
    'coin submission lookup',
    (stepTx) => stepTx`
      select id
      from coin_submissions
    `,
  );
  const submissionIds = deletedSubmissionIdsResult.ok
    ? deletedSubmissionIdsResult.value.map((submission) => submission.id)
    : [];

  if (submissionIds.length) {
    await runDbStep(
      tx,
      'coin submission links cleanup',
      (stepTx) =>
        stepTx`delete from coin_submission_links where submission_id = any(${submissionIds}::uuid[])`,
    );
    await runDbStep(
      tx,
      'coin submission contracts cleanup',
      (stepTx) =>
        stepTx`delete from coin_submission_contracts where submission_id = any(${submissionIds}::uuid[])`,
    );
    await runDbStep(
      tx,
      'coin submission categories cleanup',
      (stepTx) =>
        stepTx`delete from coin_submission_categories where submission_id = any(${submissionIds}::uuid[])`,
    );
  }

  const cleanupSteps = [
    ['admin audit logs cleanup', (stepTx) => stepTx`delete from admin_audit_logs`],
    ['rate limits cleanup', (stepTx) => stepTx`delete from rate_limits`],
    ['coin watchlists cleanup', (stepTx) => stepTx`delete from coin_watchlists`],
    ['coin votes cleanup', (stepTx) => stepTx`delete from coin_votes`],
    ['coin promotions cleanup', (stepTx) => stepTx`delete from coin_promotions`],
    ['coin boosts cleanup', (stepTx) => stepTx`delete from coin_boosts`],
    ['airdrop submissions cleanup', (stepTx) => deleteIfTableExists(stepTx, 'airdrop_submissions')],
    ['payments cleanup', (stepTx) => stepTx`delete from payments`],
    ['coin submissions cleanup', (stepTx) => stepTx`delete from coin_submissions`],
    ['change requests cleanup', (stepTx) => stepTx`delete from change_requests`],
    ['coin links cleanup', (stepTx) => stepTx`delete from coin_links`],
    ['market snapshots cleanup', (stepTx) => stepTx`delete from market_snapshots`],
    ['market sources cleanup', (stepTx) => stepTx`delete from market_sources`],
    ['coins cleanup', (stepTx) => stepTx`delete from coins`],
    ['users cleanup', (stepTx) => deleteUsers(stepTx, preservedUserId)],
    [
      'market snapshots identity reset',
      (stepTx) => resetIdentity(stepTx, 'market_snapshots', 'id'),
    ],
  ];

  for (const [label, action] of cleanupSteps) {
    await runDbStep(tx, label, action);
  }
}

async function deleteIfTableExists(tx, tableName) {
  await tx.unsafe(`delete from ${tableName}`).catch((error) => {
    if (error?.code !== '42P01') throw error;
  });
}

async function findPreservedUser(tx) {
  if (!PRESERVED_EMAIL) return null;

  const [preservedUser] = await tx`
    select id, email
    from users
    where lower(email) = lower(${PRESERVED_EMAIL})
    limit 1
  `;

  if (!preservedUser) {
    throw new Error(`Refusing to reset: preserved user ${PRESERVED_EMAIL} was not found.`);
  }

  return preservedUser;
}

async function deleteUsers(tx, preservedUserId) {
  if (!preservedUserId) {
    await tx`delete from users`;
    return;
  }

  await tx`delete from users where id <> ${preservedUserId}`;
}

function buildCompletionMessage(preservedUser) {
  return `Dev data reset complete. ${preservedUser ? `Kept user ${preservedUser.email}.` : 'No users were kept.'}`;
}

async function resetIdentity(tx, tableName, columnName) {
  await tx`
    select setval(
      pg_get_serial_sequence(${tableName}, ${columnName}),
      coalesce((select max(id) from market_snapshots), 1),
      (select exists(select 1 from market_snapshots))
    )
  `;
}

async function ensureAirdropTableExists(tx) {
  const [table] = await tx`
    select to_regclass('public.airdrop_submissions') as table_name
  `;

  if (!table?.tableName) {
    throw new Error('airdrop_submissions table does not exist. Run npm run db:migrate first.');
  }
}

async function seedProjects(tx) {
  const now = new Date();
  const coinIdsBySlug = new Map();
  const [{ nextId: firstNewId }] = await tx`
    select coalesce(max(id), 999) + 1 as next_id
    from coins
  `;
  let nextId = Number(firstNewId);

  for (const project of projects) {
    const [slug, name, symbol, category, chain] = project;
    const seedSlug = `seed-${slug}`;
    const [existingCoin] = await tx`
      select id
      from coins
      where slug = ${seedSlug}
      limit 1
    `;
    const id = existingCoin?.id ?? nextId++;

    await tx`
      insert into coins (
        id,
        slug,
        name,
        symbol,
        logo_url,
        description,
        category,
        chain,
        contract_address,
        launch_date,
        listing_source,
        listing_status,
        is_presale,
        submitted_at,
        created_at,
        updated_at
      ) values (
        ${id},
        ${seedSlug},
        ${name},
        ${symbol},
        ${logoFor(name)},
        ${`${name} is a local seed project used for previewing EndorseCoin development screens.`},
        ${category},
        ${chain},
        ${contractFor(id)},
        ${now},
        'seed',
        'active',
        false,
        ${now},
        ${now},
        ${now}
      )
      on conflict (slug) do update set
        name = excluded.name,
        symbol = excluded.symbol,
        logo_url = excluded.logo_url,
        description = excluded.description,
        category = excluded.category,
        chain = excluded.chain,
        contract_address = excluded.contract_address,
        listing_source = excluded.listing_source,
        listing_status = excluded.listing_status,
        updated_at = excluded.updated_at
    `;

    const [coin] = await tx`
      select id
      from coins
      where slug = ${seedSlug}
      limit 1
    `;
    coinIdsBySlug.set(slug, coin.id);
  }

  return coinIdsBySlug;
}

async function seedAirdrops(tx, coinIdsBySlug) {
  const now = new Date();

  for (const [index, seed] of airdropSeeds.entries()) {
    const [, projectIndex, name, rewards, winnersCount, startOffsetDays, endOffsetDays, status] =
      seed;
    const project = projects[projectIndex];
    const projectSlug = project[0];
    const coinId = coinIdsBySlug.get(projectSlug);
    if (!coinId) throw new Error(`Missing seed coin for ${projectSlug}.`);
    const startsAt = addDaysAtUtcNoon(startOffsetDays);
    const endsAt = addDaysAtUtcNoon(endOffsetDays);

    await tx`
      insert into airdrop_submissions (
        coin_id,
        submitted_by_user_id,
        requester_email,
        name,
        claim_rewards_url,
        description,
        rewards,
        winners_count,
        starts_at,
        ends_at,
        website,
        social_links,
        status,
        reviewed_at,
        created_at,
        updated_at
      ) values (
        ${coinId},
        null,
        ${seedEmail},
        ${name},
        ${`https://example.com/claim/${projectSlug}`},
        ${`${name} is a local seed airdrop for testing card layout, pagination, timelines, and link menus.`},
        ${rewards},
        ${winnersCount},
        ${startsAt},
        ${endsAt},
        ${`https://example.com/${projectSlug}`},
        ${tx.json(socialLinksFor(projectSlug))},
        ${status},
        ${now},
        ${addMinutes(now, index)},
        ${now}
      )
    `;
  }
}

function addDaysAtUtcNoon(offsetDays) {
  const value = new Date();
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value;
}

function addMinutes(value, minutes) {
  return new Date(value.getTime() + minutes * 60_000);
}

function socialLinksFor(slug) {
  return {
    telegram: `https://t.me/${slug}`,
    x: `https://x.com/${slug}`,
    reddit: `https://reddit.com/r/${slug}`,
    discord: `https://discord.gg/${slug}`,
    youtube: `https://youtube.com/@${slug}`,
    facebook: `https://facebook.com/${slug}`,
  };
}

function logoFor(name) {
  const initials = encodeURIComponent(name.slice(0, 2).toUpperCase());
  return `https://api.dicebear.com/9.x/initials/svg?seed=${initials}&backgroundColor=cbff4a&fontWeight=700`;
}

function contractFor(id) {
  return `0x${id.toString(16).padStart(40, '0')}`;
}

main()
  .catch((error) => {
    console.error('Dev reset failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
