import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { BasicAdBannerPair, PremiumAdBanner } from '@/features/ads/components/ad-banners';
import { AirdropTable } from '@/features/airdrops/components/airdrop-table';
import { getPublicAirdrops } from '@/features/airdrops/server/airdrop-list';
import type { PublicAirdropRow } from '@/features/airdrops/types';
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
  const [airdrops, promotedCoins, bannerAds] = await Promise.all([
    getPublicAirdrops(),
    getPromotedCoinItems(session?.user.id),
    getActiveBannerAds(),
  ]);
  const visibleAirdrops = sortAirdropsByStatus(airdrops);
  const airdropPages = Math.max(1, Math.ceil(visibleAirdrops.length / airdropsPageSize));
  const airdropPage = Math.min(requestedPage, airdropPages);
  const pageStart = (airdropPage - 1) * airdropsPageSize;
  const pagedAirdrops = visibleAirdrops.slice(pageStart, pageStart + airdropsPageSize);

  return (
    <main className="market-page airdrops-page">
      <SiteHeader active="airdrops" initialSession={session} />
      <BasicAdBannerPair ads={bannerAds.basic} />

      <section className="container airdrops-shell">
        <section className="leaderboard airdrops-leaderboard">
          <div className="section-title">
            <div>
              <small>AIRDROP BOARD</small>
              <h1>Community airdrops</h1>
              <p className="section-subtitle">
                Find active rewards, upcoming claims, and community drops worth watching.
              </p>
            </div>
          </div>

          {visibleAirdrops.length ? (
            <AirdropTable
              rows={pagedAirdrops}
              pageStart={pageStart}
              pagination={{
                page: airdropPage,
                pageSize: airdropsPageSize,
                total: visibleAirdrops.length,
                pages: airdropPages,
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

function sortAirdropsByStatus(airdrops: PublicAirdropRow[]) {
  return [...airdrops].sort((a, b) => {
    const aState = getAirdropTimelineState(a.startsAt, a.endsAt);
    const bState = getAirdropTimelineState(b.startsAt, b.endsAt);
    const statusDelta = getTimelineRank(aState) - getTimelineRank(bState);
    if (statusDelta !== 0) return statusDelta;

    if (aState === 'live') {
      return new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime();
    }

    if (aState === 'upcoming') {
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    }

    return new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime();
  });
}

function getAirdropTimelineState(startsAt: string, endsAt: string) {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  if (now < start) return 'upcoming';
  if (now >= end) return 'ended';
  return 'live';
}

function getTimelineRank(state: string) {
  if (state === 'live') return 0;
  if (state === 'upcoming') return 1;
  return 2;
}
