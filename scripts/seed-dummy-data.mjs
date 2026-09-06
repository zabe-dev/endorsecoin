#!/usr/bin/env node

/**
 * Dev-only dummy data seeder.
 *
 * Creates active seed coins and approved airdrops so /airdrops can be previewed
 * with pagination, statuses, timelines, and link menus.
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
const seedEmail = 'seed+airdrops@endorsecoin.local';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed dummy data while NODE_ENV=production.');
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
  ['orbitdrop-season-one', 0, 'OrbitDrop Season One', '250,000 NEB + partner NFTs', 1200, -1, 7, 'active'],
  ['glyph-early-supporter-rewards', 1, 'Glyph Early Supporter Rewards', '50 USDC each + whitelist spots', 300, 2, 12, 'scheduled'],
  ['moonkit-community-sprint', 2, 'MoonKit Community Sprint', '1,000,000 MOONK shared pool', 5000, -5, 2, 'active'],
  ['signal-pass-claims', 3, 'Signal Pass Claims', '10,000 SIG shared pool', 750, 4, 14, 'scheduled'],
  ['vault-points-round', 4, 'Vault Points Round', 'Bonus points and beta access', 2100, -3, 3, 'active'],
  ['ember-allocation-drop', 5, 'Ember Allocation Drop', '300 EMBER each', 640, 9, 16, 'scheduled'],
  ['lumen-pass-allocation', 6, 'Lumen Pass Allocation', '500 LMX each + access pass', 420, -1, 5, 'active'],
  ['prism-holder-drop', 7, 'Prism Holder Drop', 'Shared pool of 80,000 PRSM', 1600, 1, 8, 'scheduled'],
  ['nova-mystery-box', 8, 'Nova Mystery Box', 'Mystery boxes and token rewards', 900, 12, 22, 'scheduled'],
  ['harbor-boost-rewards', 9, 'Harbor Boost Rewards', 'Fee credits + HBR raffle entries', 2500, 15, 24, 'scheduled'],
  ['echo-quest-drop', 10, 'Echo Quest Drop', '125,000 ECHO shared rewards', 1100, -18, -4, 'expired'],
  ['zenith-minters-claim', 11, 'Zenith Minters Claim', 'Mint rebates and ZEN bonuses', 680, -29, -18, 'expired'],
  ['pulse-rewards-sprint', 12, 'Pulse Rewards Sprint', 'Trading credits for active users', 3300, 3, 10, 'scheduled'],
  ['aurora-list-rewards', 13, 'Aurora List Rewards', 'Whitelist allocation and AUR pool', 120, -1, 4, 'active'],
  ['river-claim-week', 14, 'River Claim Week', 'Gas rebates + RVR tickets', 1400, -20, -7, 'expired'],
  ['arcade-quest-drop', 15, 'Arcade Quest Drop', 'Rare badge NFTs + 75,000 PXF', 888, -12, -2, 'expired'],
];

async function main() {
  await db.begin(async (tx) => {
    await ensureAirdropTableExists(tx);
    const coinIdsBySlug = await seedProjects(tx);
    await tx`delete from airdrop_submissions where requester_email = ${seedEmail}`;
    await seedAirdrops(tx, coinIdsBySlug);
  });

  console.log(`Dummy seed complete. Added ${projects.length} projects and ${airdropSeeds.length} airdrops.`);
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
    const [, projectIndex, name, rewards, winnersCount, startOffsetDays, endOffsetDays, status] = seed;
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
    console.error('Dummy seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
