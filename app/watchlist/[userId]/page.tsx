import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { AccountPagination, PublicWatchlistTable } from '@/features/account/components/account-panel';
import { PremiumAdBanner } from '@/features/ads/components/ad-banners';
import { getActiveBannerAds } from '@/features/ads/server/banner-ads';
import { getWatchlistTablePage } from '@/features/account/server/watchlist';
import { processExpiredCoinDeletionRequests } from '@/features/coins/server/delete-requests';
import { processExpiredPresales } from '@/features/coins/server/presale-expiry';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { getCurrentSession } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../../market.css';
import '../../scroll-fix.css';

type WatchlistPageParams = {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: 'Public watchlist',
  robots: { index: false, follow: false },
};

export default async function PublicWatchlistPage({ params, searchParams }: WatchlistPageParams) {
  const { userId } = await params;
  const query = await searchParams;
  const session = await getCurrentSession();
  await processExpiredPresales();
  await processExpiredCoinDeletionRequests();

  const [owner] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!owner) notFound();

  const [watchlistPage, bannerAds] = await Promise.all([
    getWatchlistTablePage(userId, session?.user.id, { page: readParam(query?.page) }),
    getActiveBannerAds(),
  ]);
  const ownerName = owner.name.trim() || 'Investor';

  return (
    <main className="market-page">
      <SiteHeader active="none" initialSession={session} />
      <section className="container settings-shell account-shell public-watchlist-shell">
        <header className="account-heading">
          <h1>{ownerName}&apos;s Watchlist</h1>
          <p>Viewing a shared watchlist.</p>
        </header>

        <section className="settings-card submissions-card watchlist-page-card">
          <div className="watchlist-page-toolbar">
            <span>{watchlistPage.total}</span>
          </div>
          {watchlistPage.rows.length ? (
            <PublicWatchlistTable coins={watchlistPage.rows} isSignedIn={Boolean(session?.user)} />
          ) : (
            <div className="settings-empty">
              <strong>There is currently no projects available to display.</strong>
            </div>
          )}
          <AccountPagination pagination={watchlistPage} />
        </section>
        <div className="account-table-ad account-table-ad-inline">
          <PremiumAdBanner ads={bannerAds.premium} offset={3} />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
