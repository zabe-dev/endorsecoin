#!/usr/bin/env node

/**
 * Dev-only reset helper.
 *
 * Runs, in order:
 * - Redis FLUSHDB, when REDIS_URL is set
 * - app data cleanup
 *
 * Options:
 * - --redis-all: use Redis FLUSHALL instead of FLUSHDB
 * - --skip-redis: skip Redis cleanup
 */

import Redis from 'ioredis';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const PRESERVED_EMAIL = process.env.DEV_RESET_KEEP_USER_EMAIL?.trim();
const shouldFlushAllRedis = process.argv.includes('--redis-all');
const shouldSkipRedis = process.argv.includes('--skip-redis');

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
  await runStep('Redis cleanup', flushRedis);

  await db.begin(async (tx) => {
    const preservedUser = await findPreservedUser(tx);
    await resetData(tx, preservedUser);

    console.log(buildCompletionMessage(preservedUser));
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

  const redisTlsCaPath = process.env.REDIS_TLS_CA_CERT_PATH;
  if (redisTlsCaPath) {
    try {
      readFileSync(redisTlsCaPath, 'utf8');
    } catch (error) {
      console.log(
        `Redis cleanup skipped. Could not read REDIS_TLS_CA_CERT_PATH: ${formatError(error)}`,
      );
      return;
    }
  }

  const redis = new Redis(REDIS_URL, {
    connectTimeout: 3000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    ...(redisTlsCaPath ? { tls: { ca: readFileSync(redisTlsCaPath, 'utf8') } } : {}),
  });
  redis.on('error', () => {});

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

main()
  .catch((error) => {
    console.error('Dev reset failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
