import { HomeClient } from '@/app/home-client';
import { SiteHeader } from '@/components/layout/site-header';
import { getActiveBannerAds } from '@/features/ads/server/banner-ads';
import { getDiscoveryData } from '@/features/coins/server/discovery';
import { getCurrentSession } from '@/lib/auth/session';
import './market.css';
import './scroll-fix.css';

type HomeParams = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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
