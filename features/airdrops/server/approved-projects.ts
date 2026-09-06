import 'server-only';

import type { ApprovedProjectOption } from '@/features/airdrops/types';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';
import { db } from '@/lib/db/client';
import { coins } from '@/lib/db/schema';
import { asc, eq, sql } from 'drizzle-orm';

const approvedProjectCacheSeconds = Number(
  process.env.APPROVED_PROJECT_OPTIONS_CACHE_SECONDS || 60,
);

export async function getApprovedProjectOptions(): Promise<ApprovedProjectOption[]> {
  const version = await getCacheVersion('public-coins');
  return rememberJson(
    `submissions:approved-project-options:${version}:v1`,
    { ttlSeconds: approvedProjectCacheSeconds },
    async () => {
      const rows = await db
        .select({ id: coins.id, name: coins.name, symbol: coins.symbol })
        .from(coins)
        .where(eq(coins.listingStatus, 'active'))
        .orderBy(asc(coins.name))
        .limit(500);

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        symbol: row.symbol,
      }));
    },
  );
}

export type ApprovedProjectLookupResult =
  | { status: 'empty' }
  | { status: 'missing' }
  | { status: 'found'; project: ApprovedProjectOption }
  | { status: 'ambiguous'; projects: ApprovedProjectOption[] };

export async function lookupApprovedProjectExact(
  query: string,
): Promise<ApprovedProjectLookupResult> {
  const normalizedQuery = normalizeProjectLookup(query);
  if (!normalizedQuery) return { status: 'empty' };

  const rows = await db
    .select({ id: coins.id, name: coins.name, symbol: coins.symbol })
    .from(coins)
    .where(
      sql`${coins.listingStatus} = 'active'
        and (
          lower(regexp_replace(trim(${coins.name}), '[[:space:]]+', ' ', 'g')) = ${normalizedQuery}
          or lower(regexp_replace(trim(${coins.symbol}), '[[:space:]]+', ' ', 'g')) = ${normalizedQuery}
          or lower(regexp_replace(trim(${coins.name} || ' (' || ${coins.symbol} || ')'), '[[:space:]]+', ' ', 'g')) = ${normalizedQuery}
        )`,
    )
    .orderBy(asc(coins.name), asc(coins.id))
    .limit(3);

  if (!rows.length) return { status: 'missing' };
  if (rows.length > 1) return { status: 'ambiguous', projects: rows };
  return { status: 'found', project: rows[0] };
}

export function normalizeProjectLookup(value: string) {
  return value.trim().replace(/^\$/, '').replace(/\s+/g, ' ').toLowerCase();
}
