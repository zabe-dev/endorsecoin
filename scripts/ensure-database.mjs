#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import postgres from 'postgres';

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Production builds receive DATABASE_URL from the environment.
  }
}

if (!process.env.DATABASE_URL) {
  console.log('[db] DATABASE_URL is not set; skipping initial migration check.');
  process.exit(0);
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 10,
  prepare: false,
});

try {
  const [{ hasApplicationTables }] = await sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name <> '__drizzle_migrations'
    ) as "hasApplicationTables"
  `;

  if (hasApplicationTables) {
    console.log('[db] Application tables exist; skipping initial migration.');
  } else {
    console.log('[db] No application tables found; running initial migrations.');
    execFileSync(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'migrate'], {
      stdio: 'inherit',
      env: process.env,
    });
  }
} finally {
  await sql.end({ timeout: 5 });
}
