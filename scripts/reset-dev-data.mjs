#!/usr/bin/env node

/**
 * Dev-only database cleanup.
 *
 * Keeps:
 * - user email from DEV_RESET_KEEP_USER_EMAIL
 * - coin name from DEV_RESET_KEEP_COIN_NAME
 *
 * Everything else in app data tables is deleted in dependency-safe order.
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
const PRESERVED_EMAIL = process.env.DEV_RESET_KEEP_USER_EMAIL;
const PRESERVED_COIN_NAME = process.env.DEV_RESET_KEEP_COIN_NAME;

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to reset data while NODE_ENV=production.');
}

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

if (!PRESERVED_EMAIL) {
  throw new Error('DEV_RESET_KEEP_USER_EMAIL is required.');
}

if (!PRESERVED_COIN_NAME) {
  throw new Error('DEV_RESET_KEEP_COIN_NAME is required.');
}

const db = postgres(DATABASE_URL, {
  max: 1,
  transform: postgres.camel,
});

async function main() {
  await db.begin(async (tx) => {
    const [preservedUser] = await tx`
      select id, email
      from users
      where lower(email) = lower(${PRESERVED_EMAIL})
      limit 1
    `;

    if (!preservedUser) {
      throw new Error(`Refusing to reset: preserved user ${PRESERVED_EMAIL} was not found.`);
    }

    const preservedCoins = await tx`
      select id, name
      from coins
      where lower(name) = lower(${PRESERVED_COIN_NAME})
    `;

    if (!preservedCoins.length) {
      throw new Error(`Refusing to reset: preserved coin "${PRESERVED_COIN_NAME}" was not found.`);
    }

    const preservedCoinIds = preservedCoins.map((coin) => coin.id);
    const deletedSubmissionIds = await tx`
      select id
      from coin_submissions
      where coin_id is null
        or not (coin_id = any(${preservedCoinIds}))
    `;
    const submissionIds = deletedSubmissionIds.map((submission) => submission.id);

    if (submissionIds.length) {
      await tx`delete from coin_submission_links where submission_id = any(${submissionIds}::uuid[])`;
      await tx`delete from coin_submission_contracts where submission_id = any(${submissionIds}::uuid[])`;
      await tx`delete from coin_submission_categories where submission_id = any(${submissionIds}::uuid[])`;
    }

    await tx`delete from admin_audit_logs`;
    await tx`delete from rate_limits`;
    await tx`
      delete from coin_watchlists
      where not (coin_id = any(${preservedCoinIds}::int[]) and user_id = ${preservedUser.id})
    `;
    await tx`
      delete from coin_votes
      where not (coin_id = any(${preservedCoinIds}::int[]) and user_id = ${preservedUser.id})
    `;
    await tx`delete from coin_promotions where not (coin_id = any(${preservedCoinIds}::int[]))`;
    await tx`delete from coin_boosts where not (coin_id = any(${preservedCoinIds}::int[]))`;
    await tx`delete from payments where coin_id is null or not (coin_id = any(${preservedCoinIds}::int[]))`;
    await tx`
      delete from coin_submissions
      where coin_id is null
        or not (coin_id = any(${preservedCoinIds}::int[]))
    `;
    await tx`delete from change_requests where not (coin_id = any(${preservedCoinIds}::int[]))`;
    await tx`delete from coin_links where not (coin_id = any(${preservedCoinIds}::int[]))`;
    await tx`delete from market_snapshots where not (coin_id = any(${preservedCoinIds}::int[]))`;
    await tx`delete from market_sources where not (coin_id = any(${preservedCoinIds}::int[]))`;
    await tx`delete from coins where not (id = any(${preservedCoinIds}::int[]))`;
    await tx`delete from users where id <> ${preservedUser.id}`;

    await resetIdentity(tx, 'market_snapshots', 'id');

    console.log(
      `Dev data reset complete. Kept user ${preservedUser.email} and ${preservedCoins.length} "${PRESERVED_COIN_NAME}" coin row(s).`,
    );
  });
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

main()
  .catch((error) => {
    console.error('Dev data reset failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
