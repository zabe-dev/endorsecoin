import { NextResponse } from 'next/server';
import { siteUrl } from '@/lib/seo/metadata';

export const dynamic = 'force-static';

export function GET() {
  return new NextResponse(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /account',
      'Disallow: /admin',
      'Disallow: /api',
      'Disallow: /dashboard',
      'Disallow: /settings',
      'Disallow: /submit',
      'Disallow: /watchlist',
      '',
      `Sitemap: ${siteUrl}/sitemap.xml`,
      '',
    ].join('\n'),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}
