import 'server-only';

import type { AirdropSocialLinks, PublicAirdropRow } from '@/features/airdrops/types';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';
import { db } from '@/lib/db/client';
import { isMissingRelationError } from '@/lib/db/errors';
import { airdropSubmissions, coins } from '@/lib/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';

const publicAirdropCacheSeconds = Number(process.env.PUBLIC_AIRDROP_LIST_CACHE_SECONDS || 60);
const defaultAirdropPageSize = 8;
const maxAirdropPageSize = 24;

type PublicAirdropPageOptions = {
  page?: string | number | null;
  pageSize?: string | number | null;
};

export type PublicAirdropPage = {
  rows: PublicAirdropRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

export async function getPublicAirdropPage(
  options: PublicAirdropPageOptions = {},
): Promise<PublicAirdropPage> {
  const pageSize = normalizePositiveInteger(
    options.pageSize,
    defaultAirdropPageSize,
    maxAirdropPageSize,
  );
  const requestedPage = normalizePositiveInteger(options.page, 1, Number.MAX_SAFE_INTEGER);

  const [airdropVersion, coinVersion] = await Promise.all([
    getCacheVersion('public-airdrops'),
    getCacheVersion('public-coins'),
  ]);

  const pageData = await rememberJson(
    `airdrops:public:page:${airdropVersion}:${coinVersion}:${requestedPage}:${pageSize}:v1`,
    { ttlSeconds: publicAirdropCacheSeconds },
    () => readPublicAirdropPage(requestedPage, pageSize),
  );

  const total = pageData.total;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pages);

  if (!pageData.rows.length && total > 0 && requestedPage > 1) {
    return getPublicAirdropPage({ page: 1, pageSize });
  }

  return { rows: pageData.rows, total, page, pageSize, pages };
}

async function readPublicAirdropPage(
  page: number,
  pageSize: number,
): Promise<{ rows: PublicAirdropRow[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const nowIso = new Date().toISOString();
  const visibleAirdropWhere = and(
    eq(coins.listingStatus, 'active'),
    sql`${airdropSubmissions.status} in ('approved', 'active', 'scheduled', 'expired', 'inactive')`,
  );

  try {
    const [countRows, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(airdropSubmissions)
        .innerJoin(coins, eq(airdropSubmissions.coinId, coins.id))
        .where(visibleAirdropWhere),
      db
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
        .where(visibleAirdropWhere)
        .orderBy(
          sql`case
            when ${airdropSubmissions.startsAt} <= ${nowIso}::timestamptz
              and ${airdropSubmissions.endsAt} > ${nowIso}::timestamptz then 0
            when ${airdropSubmissions.startsAt} > ${nowIso}::timestamptz then 1
            else 2
          end`,
          sql`case
            when ${airdropSubmissions.startsAt} <= ${nowIso}::timestamptz
              and ${airdropSubmissions.endsAt} > ${nowIso}::timestamptz
              then ${airdropSubmissions.endsAt}
          end asc`,
          sql`case
            when ${airdropSubmissions.startsAt} > ${nowIso}::timestamptz
              then ${airdropSubmissions.startsAt}
          end asc`,
          sql`case
            when ${airdropSubmissions.endsAt} <= ${nowIso}::timestamptz
              then ${airdropSubmissions.endsAt}
          end desc`,
          asc(airdropSubmissions.createdAt),
        )
        .limit(pageSize)
        .offset(offset),
    ]);

    return {
      total: Number(countRows[0]?.count || 0),
      rows: rows.map((row) => ({
        ...row,
        socialLinks: normalizeAirdropSocialLinks(row.socialLinks),
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
      })),
    };
  } catch (error) {
    if (isMissingRelationError(error, 'airdrop_submissions')) {
      console.warn(
        '[airdrops] airdrop_submissions table is unavailable. Run migrations to enable airdrops.',
      );
      return { rows: [], total: 0 };
    }

    throw error;
  }
}

function normalizePositiveInteger(
  value: string | number | null | undefined,
  fallback: number,
  max: number,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
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
