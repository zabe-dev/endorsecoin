#!/usr/bin/env node

/**
 * Dev-only database cleanup.
 *
 * Optionally keeps:
 * - user email from DEV_RESET_KEEP_USER_EMAIL, when provided
 *
 * Everything else in app data tables is deleted in dependency-safe order.
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
const PRESERVED_EMAIL = process.env.DEV_RESET_KEEP_USER_EMAIL?.trim();

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

async function main() {
  await db.begin(async (tx) => {
    const preservedUser = await findPreservedUser(tx);
    const preservedUserId = preservedUser?.id ?? null;

    const deletedSubmissionIds = await tx`
      select id
      from coin_submissions
    `;
    const submissionIds = deletedSubmissionIds.map((submission) => submission.id);

    if (submissionIds.length) {
      await tx`delete from coin_submission_links where submission_id = any(${submissionIds}::uuid[])`;
      await tx`delete from coin_submission_contracts where submission_id = any(${submissionIds}::uuid[])`;
      await tx`delete from coin_submission_categories where submission_id = any(${submissionIds}::uuid[])`;
    }

    await tx`delete from admin_audit_logs`;
    await tx`delete from rate_limits`;
    await tx`delete from coin_watchlists`;
    await tx`delete from coin_votes`;
    await tx`delete from coin_promotions`;
    await tx`delete from coin_boosts`;
    await deleteIfTableExists(tx, 'airdrop_submissions');
    await tx`delete from payments`;
    await tx`delete from coin_submissions`;
    await tx`delete from change_requests`;
    await tx`delete from coin_links`;
    await tx`delete from market_snapshots`;
    await tx`delete from market_sources`;
    await tx`delete from coins`;
    await deleteUsers(tx, preservedUserId);

    await resetIdentity(tx, 'market_snapshots', 'id');

    console.log(buildCompletionMessage(preservedUser));
  });
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

main()
  .catch((error) => {
    console.error('Dev data reset failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
