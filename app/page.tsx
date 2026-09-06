import { HomeClient } from '@/app/home-client';
import { SiteHeader } from '@/components/layout/site-header';
import { JsonLd } from '@/components/seo/json-ld';
import { getActiveBannerAds } from '@/features/ads/server/banner-ads';
import { getDiscoveryData } from '@/features/coins/server/discovery';
import { getCurrentSession } from '@/lib/auth/session';
import { createPublicPageMetadata, homeDescription, homeTitle, siteUrl } from '@/lib/seo/metadata';
import type { Metadata } from 'next';
import './market.css';
import './scroll-fix.css';

type HomeParams = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: HomeParams): Promise<Metadata> {
  const params = await searchParams;
  const page = readParam(params?.page);
  const normalizedPage = normalizePageParam(page);
  const hasInternalVariant = Boolean(
    readParam(params?.q) ||
    readParam(params?.coins) ||
    readParam(params?.view) ||
    readParam(params?.category) ||
    readParam(params?.chain) ||
    readParam(params?.sort) ||
    readParam(params?.dir),
  );
  const path = normalizedPage > 1 ? `/?page=${normalizedPage}` : '/';

  return createPublicPageMetadata({
    title: homeTitle,
    description: homeDescription,
    path,
    absoluteTitle: true,
    robots: hasInternalVariant ? { index: false, follow: true } : undefined,
  });
}

export default async function Home({ searchParams }: HomeParams) {
  const params = await searchParams;
  const session = await getCurrentSession();
  const [discovery, bannerAds] = await Promise.all([
    getDiscoveryData({
      view: readParam(params?.coins) || readParam(params?.view),
      category: readParam(params?.category),
      chain: readParam(params?.chain),
      search: readParam(params?.q),
      sort: readParam(params?.sort),
      direction: readParam(params?.dir) === 'asc' ? 'asc' : 'desc',
      page: readParam(params?.page),
      userId: session?.user.id,
    }),
    getActiveBannerAds(),
  ]);
  const leaderboardPage = discovery.leaderboard;
  return (
    <>
      <SiteHeader initialSession={session} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Community leaderboard',
          url: `${siteUrl}${leaderboardPage.page > 1 ? `/?page=${leaderboardPage.page}` : '/'}`,
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: leaderboardPage.rows.map((coin, index) => ({
              '@type': 'ListItem',
              position: (leaderboardPage.page - 1) * leaderboardPage.pageSize + index + 1,
              name: `${coin.name} (${coin.symbol})`,
              url: `${siteUrl}/coin/${coin.coinId}`,
            })),
          },
        }}
      />
      <HomeClient
        key={[
          leaderboardPage.view,
          leaderboardPage.category,
          leaderboardPage.chain,
          leaderboardPage.search,
          leaderboardPage.sort.key,
          leaderboardPage.sort.direction,
          leaderboardPage.page,
        ].join(':')}
        initialHotspots={discovery.hotspots}
        initialPromotedCoins={discovery.promotedCoins}
        initialLeaderboard={leaderboardPage}
        isSignedIn={Boolean(session?.user)}
        bannerAds={bannerAds}
      />
    </>
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizePageParam(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 1 ? parsed : 1;
}
