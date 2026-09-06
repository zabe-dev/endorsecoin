import 'server-only';

import { asc, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { bannerAds } from '@/lib/db/schema';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';
import {
  bannerPlacements,
  normalizeBannerPlacement,
  type BannerAdMap,
  type BannerPlacement,
} from '@/features/ads/types';

const emptyBannerMap = (): BannerAdMap => ({
  basic: [],
  premium: [],
  fixed: [],
});

const activeBannerCacheSeconds = Number(process.env.BANNER_AD_CACHE_SECONDS || 60);

export async function getActiveBannerAds(): Promise<BannerAdMap> {
  const version = await getCacheVersion('banner-ads');
  return rememberJson(
    `banner-ads:active:${version}:v1`,
    { ttlSeconds: activeBannerCacheSeconds },
    readActiveBannerAds,
  );
}

async function readActiveBannerAds(): Promise<BannerAdMap> {
  await syncBannerAdStatuses();
  const nowIso = new Date().toISOString();
  const rows = await db
    .select()
    .from(bannerAds)
    .where(
      sql`${bannerAds.status} in ('active', 'scheduled')
        and ${bannerAds.startsAt} <= ${nowIso}::timestamptz
        and (${bannerAds.expiresAt} is null or ${bannerAds.expiresAt} > ${nowIso}::timestamptz)`,
    )
    .orderBy(asc(bannerAds.priority), asc(bannerAds.createdAt))
    .catch((error) => {
      console.warn(
        '[banner-ads] Active banner lookup skipped:',
        error instanceof Error ? error.message : error,
      );
      return [];
    });

  const map = emptyBannerMap();

  rows.forEach((row) => {
    const placement = normalizeBannerPlacement(row.placement);
    if (!placement) return;
    map[placement].push({
      id: row.id,
      placement,
      title: row.title,
      subtitle: row.subtitle,
      desktopImageUrl: row.desktopImageUrl,
      mobileImageUrl: row.mobileImageUrl,
      targetUrl: row.targetUrl,
    });
  });

  return map;
}

export async function getAdminBannerAds() {
  await syncBannerAdStatuses();
  return db.select().from(bannerAds).orderBy(asc(bannerAds.placement), asc(bannerAds.priority));
}

export function isBannerPlacement(value: string): value is BannerPlacement {
  return bannerPlacements.includes(value as BannerPlacement);
}

async function syncBannerAdStatuses() {
  const nowIso = new Date().toISOString();
  await Promise.all([
    db
      .update(bannerAds)
      .set({ status: 'inactive', updatedAt: new Date() })
      .where(
        sql`${bannerAds.status} <> 'inactive'
          and ${bannerAds.expiresAt} is not null
          and ${bannerAds.expiresAt} <= ${nowIso}::timestamptz`,
      )
      .catch(() => undefined),
    db
      .update(bannerAds)
      .set({ status: 'active', updatedAt: new Date() })
      .where(
        sql`${bannerAds.status} = 'scheduled'
          and ${bannerAds.startsAt} <= ${nowIso}::timestamptz
          and (${bannerAds.expiresAt} is null or ${bannerAds.expiresAt} > ${nowIso}::timestamptz)`,
      )
      .catch(() => undefined),
  ]);
}
