import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { WatchlistPanel } from '@/features/account/components/account-panel';
import { PremiumAdBanner } from '@/features/ads/components/ad-banners';
import { getActiveBannerAds } from '@/features/ads/server/banner-ads';
import { getWatchlistTablePage } from '@/features/account/server/watchlist';
import { processExpiredCoinDeletionRequests } from '@/features/coins/server/delete-requests';
import { processExpiredPresales } from '@/features/coins/server/presale-expiry';
import { getCurrentSession } from '@/lib/auth/session';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import '../market.css';
import '../scroll-fix.css';

export const metadata: Metadata = {
  title: 'Watchlist',
  robots: { index: false, follow: false },
};

type WatchlistPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WatchlistPage({ searchParams }: WatchlistPageProps) {
  const params = await searchParams;
  const session = await getCurrentSession();
  if (!session) redirect('/');

  await processExpiredPresales();
  await processExpiredCoinDeletionRequests();
  const [watchlistPage, bannerAds] = await Promise.all([
    getWatchlistTablePage(session.user.id, session.user.id, { page: readParam(params?.page) }),
    getActiveBannerAds(),
  ]);

  return (
    <main className="market-page">
      <SiteHeader active="none" initialSession={session} />
      <WatchlistPanel
        userId={session.user.id}
        coins={watchlistPage.rows}
        isSignedIn={true}
        pagination={watchlistPage}
        afterTable={<PremiumAdBanner ads={bannerAds.premium} offset={3} />}
      />
      <SiteFooter />
    </main>
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
