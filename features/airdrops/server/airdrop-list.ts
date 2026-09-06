import 'server-only';

import type { AirdropSocialLinks, PublicAirdropRow } from '@/features/airdrops/types';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';
import { db } from '@/lib/db/client';
import { airdropSubmissions, coins } from '@/lib/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';

const publicAirdropCacheSeconds = Number(process.env.PUBLIC_AIRDROP_LIST_CACHE_SECONDS || 60);

export async function getPublicAirdrops(): Promise<PublicAirdropRow[]> {
  const [airdropVersion, coinVersion] = await Promise.all([
    getCacheVersion('public-airdrops'),
    getCacheVersion('public-coins'),
  ]);

  return rememberJson(
    `airdrops:public:list:${airdropVersion}:${coinVersion}:v1`,
    { ttlSeconds: publicAirdropCacheSeconds },
    async () => {
      try {
        const rows = await db
          .select({
            id: airdropSubmissions.id,
            coinId: coins.id,
            name: airdropSubmissions.name,
            projectName: coins.name,
            projectSymbol: coins.symbol,
            projectLogoUrl: coins.logoUrl,
            rewards: airdropSubmissions.rewards,
            winnersCount: airdropSubmissions.winnersCount,
            startsAt: airdropSubmissions.startsAt,
            endsAt: airdropSubmissions.endsAt,
            claimRewardsUrl: airdropSubmissions.claimRewardsUrl,
            website: airdropSubmissions.website,
            socialLinks: airdropSubmissions.socialLinks,
            status: airdropSubmissions.status,
          })
          .from(airdropSubmissions)
          .innerJoin(coins, eq(airdropSubmissions.coinId, coins.id))
          .where(
            and(
              eq(coins.listingStatus, 'active'),
              sql`${airdropSubmissions.status} in ('approved', 'active', 'scheduled', 'expired', 'inactive')`,
            ),
          )
          .orderBy(asc(airdropSubmissions.startsAt), asc(airdropSubmissions.createdAt))
          .limit(100);

        return rows.map((row) => ({
          ...row,
          socialLinks: normalizeAirdropSocialLinks(row.socialLinks),
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
        }));
      } catch (error) {
        if (isMissingAirdropSubmissionsTable(error)) {
          console.warn(
            '[airdrops] airdrop_submissions table is unavailable. Run migrations to enable airdrops.',
          );
          return [];
        }

        throw error;
      }
    },
  );
}

function isMissingAirdropSubmissionsTable(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string; cause?: unknown };
  if (candidate.code === '42P01') return true;
  if (candidate.message?.includes('airdrop_submissions')) return true;

  const cause = candidate.cause;
  if (!cause || typeof cause !== 'object') return false;
  const nested = cause as { code?: string; message?: string };
  return nested.code === '42P01' || Boolean(nested.message?.includes('airdrop_submissions'));
}

function normalizeAirdropSocialLinks(value: unknown): AirdropSocialLinks {
  if (!value || typeof value !== 'object') return {};
  const links = value as Record<string, unknown>;
  return {
    telegram: readOptionalUrl(links.telegram),
    x: readOptionalUrl(links.x),
    reddit: readOptionalUrl(links.reddit),
    discord: readOptionalUrl(links.discord),
    youtube: readOptionalUrl(links.youtube),
    facebook: readOptionalUrl(links.facebook),
  };
}

function readOptionalUrl(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
