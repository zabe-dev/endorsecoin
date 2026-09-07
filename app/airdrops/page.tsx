import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { JsonLd } from '@/components/seo/json-ld';
import { BasicAdBannerPair, PremiumAdBanner } from '@/features/ads/components/ad-banners';
import { AirdropTable } from '@/features/airdrops/components/airdrop-table';
import { getPublicAirdropPage } from '@/features/airdrops/server/airdrop-list';
import { PromotedCoinsTable } from '@/features/coins/components';
import { getPromotedCoinItems } from '@/features/coins/server/discovery';
import { getActiveBannerAds } from '@/features/ads/server/banner-ads';
import { getCurrentSession } from '@/lib/auth/session';
import { createPublicPageMetadata, siteUrl } from '@/lib/seo/metadata';
import { CalendarClock } from 'lucide-react';
import type { Metadata } from 'next';
import '../market.css';
import './airdrops.css';

type AirdropsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const airdropsPageSize = 8;

export async function generateMetadata({ searchParams }: AirdropsPageProps): Promise<Metadata> {
  const params = await searchParams;
  const page = readPositiveInt(readSearchParam(params?.page), 1);

  return createPublicPageMetadata({
    title: 'Live & Upcoming Airdrops',
    description:
      'Explore airdrops, check rewards and claim dates, and find official links for live and upcoming campaigns.',
    path: page > 1 ? `/airdrops?page=${page}` : '/airdrops',
  });
}

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
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Community airdrops',
          url: `${siteUrl}${airdropPageData.page > 1 ? `/airdrops?page=${airdropPageData.page}` : '/airdrops'}`,
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: airdropPageData.rows.map((airdrop, index) => ({
              '@type': 'ListItem',
              position: pageStart + index + 1,
              name: airdrop.name,
              url: `${siteUrl}/coin/${airdrop.coinId}`,
            })),
          },
        }}
      />
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

      {promotedCoins.length > 0 && (
        <section className="container promoted-section airdrops-promoted-section">
          <PromotedCoinsTable coins={promotedCoins} isSignedIn={Boolean(session?.user)} />
        </section>
      )}
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
