import type { MetadataRoute } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { coins } from '@/lib/db/schema';
import { siteUrl } from '@/lib/seo/metadata';

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

const staticRoutes = [
  { path: '/', priority: 1 },
  { path: '/airdrops', priority: 0.8 },
  { path: '/advertise', priority: 0.5 },
  { path: '/partners', priority: 0.5 },
  { path: '/privacy', priority: 0.2 },
  { path: '/terms', priority: 0.2 },
  { path: '/disclaimer', priority: 0.2 },
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = staticRoutes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    changeFrequency: route.path === '/' || route.path === '/airdrops' ? 'daily' : 'monthly',
    priority: route.priority,
  })) satisfies MetadataRoute.Sitemap;

  const coinRows = await db
    .select({
      id: coins.id,
      updatedAt: coins.updatedAt,
    })
    .from(coins)
    .where(eq(coins.listingStatus, 'active'))
    .orderBy(coins.id)
    .limit(45000)
    .catch((error) => {
      console.warn('[seo] Unable to read active coins for sitemap.', error);
      return [];
    });

  return [
    ...staticEntries,
    ...coinRows.map((coin) => ({
      url: `${siteUrl}/coin/${coin.id}`,
      lastModified: coin.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ];
}
