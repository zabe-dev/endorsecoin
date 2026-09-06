import 'server-only';

import type { ApprovedProjectOption } from '@/features/airdrops/types';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';
import { db } from '@/lib/db/client';
import { coins } from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';

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
