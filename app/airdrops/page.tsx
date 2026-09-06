import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { BasicAdBannerPair, PremiumAdBanner } from '@/features/ads/components/ad-banners';
import { AirdropTable } from '@/features/airdrops/components/airdrop-table';
import { getPublicAirdropPage } from '@/features/airdrops/server/airdrop-list';
import { PromotedCoinsTable } from '@/features/coins/components';
import { getPromotedCoinItems } from '@/features/coins/server/discovery';
import { getActiveBannerAds } from '@/features/ads/server/banner-ads';
import { getCurrentSession } from '@/lib/auth/session';
import { CalendarClock } from 'lucide-react';
import type { Metadata } from 'next';
import '../market.css';
import './airdrops.css';

export const metadata: Metadata = {
  title: 'Crypto Airdrops',
  description:
    'Discover crypto airdrops from approved EndorseCoin projects and submit reward campaigns for review.',
  alternates: {
    canonical: '/airdrops',
  },
};

type AirdropsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const airdropsPageSize = 8;

export default async function AirdropsPage({ searchParams }: AirdropsPageProps) {
  const resolvedSearchParams = await searchParams;
  const requestedPage = readPositiveInt(readSearchParam(resolvedSearchParams?.page), 1);
  const session = await getCurrentSession();
  const [airdropPageData, promotedCoins, bannerAds] = await Promise.all([
    getPublicAirdropPage({ page: requestedPage, pageSize: airdropsPageSize }),
    getPromotedCoinItems(session?.user.id),
    getActiveBannerAds(),
  ]);
  const pageStart = (airdropPageData.page - 1) * airdropPageData.pageSize;

  return (
    <main className="market-page airdrops-page">
      <SiteHeader active="airdrops" initialSession={session} />
      <BasicAdBannerPair ads={bannerAds.basic} />

      <section className="container airdrops-shell">
        <section className="leaderboard airdrops-leaderboard" id="airdrops">
          <div className="section-title">
            <div>
              <small>AIRDROP BOARD</small>
              <h1>Community airdrops</h1>
              <p className="section-subtitle">
                Find active rewards, upcoming claims, and community drops worth watching.
              </p>
            </div>
          </div>

          {airdropPageData.total ? (
            <AirdropTable
              rows={airdropPageData.rows}
              pageStart={pageStart}
              pagination={{
                page: airdropPageData.page,
                pageSize: airdropPageData.pageSize,
                total: airdropPageData.total,
                pages: airdropPageData.pages,
              }}
            />
          ) : (
            <div className="airdrops-empty-preview">
              <CalendarClock aria-hidden="true" />
              <span>There are currently no approved airdrops available to display.</span>
            </div>
          )}
        </section>
      </section>

      <PremiumAdBanner ads={bannerAds.premium} />

      <section className="container promoted-section airdrops-promoted-section">
        <PromotedCoinsTable coins={promotedCoins} isSignedIn={Boolean(session?.user)} />
      </section>
      <SiteFooter />
    </main>
  );
}



function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
