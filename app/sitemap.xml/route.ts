import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { coins } from '@/lib/db/schema';
import { siteUrl } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const staticRoutes = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/airdrops', priority: '0.8', changefreq: 'daily' },
  { path: '/advertise', priority: '0.5', changefreq: 'monthly' },
  { path: '/partners', priority: '0.5', changefreq: 'monthly' },
  { path: '/privacy', priority: '0.2', changefreq: 'monthly' },
  { path: '/terms', priority: '0.2', changefreq: 'monthly' },
  { path: '/disclaimer', priority: '0.2', changefreq: 'monthly' },
] as const;

export async function GET() {
  const staticEntries = staticRoutes.map((route) =>
    sitemapEntry({
      loc: `${siteUrl}${route.path}`,
      changefreq: route.changefreq,
      priority: route.priority,
    }),
  );

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

  const coinEntries = coinRows.map((coin) =>
    sitemapEntry({
      loc: `${siteUrl}/coin/${coin.id}`,
      lastmod: coin.updatedAt.toISOString(),
      changefreq: 'daily',
      priority: '0.7',
    }),
  );

  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
      ...staticEntries,
      ...coinEntries,
    ].join('\n')}\n</urlset>\n`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}

function sitemapEntry({
  loc,
  lastmod,
  changefreq,
  priority,
}: {
  loc: string;
  lastmod?: string;
  changefreq: string;
  priority: string;
}) {
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : '',
    `    <changefreq>${escapeXml(changefreq)}</changefreq>`,
    `    <priority>${escapeXml(priority)}</priority>`,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
