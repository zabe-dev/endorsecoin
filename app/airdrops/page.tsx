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
  const visibleAirdrops = sortAirdropsByStatus(
    airdrops.length || process.env.NODE_ENV === 'production' ? airdrops : demoAirdrops,
  );
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
              <small>LIVE RANKINGS</small>
              <h1>Community airdrops</h1>
              <p className="section-subtitle">
                Ranked by active claim windows from approved EndorseCoin projects.
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

function demoSocialLinks(slug: string) {
  return {
    telegram: `https://t.me/${slug}`,
    x: `https://x.com/${slug}`,
    reddit: `https://reddit.com/r/${slug}`,
    discord: `https://discord.gg/${slug}`,
    youtube: `https://youtube.com/@${slug}`,
    facebook: `https://facebook.com/${slug}`,
  };
}

const demoAirdrops = [
  {
    id: 'demo-orbitdrop',
    coinId: 1,
    name: 'OrbitDrop Season One',
    projectName: 'NebulaFi',
    projectSymbol: 'NEB',
    projectLogoUrl: null,
    rewards: '250,000 NEB + partner NFTs',
    winnersCount: 1200,
    startsAt: '2026-09-05T00:00:00.000Z',
    endsAt: '2026-09-12T23:59:00.000Z',
    claimRewardsUrl: 'https://example.com/claim/nebulafi',
    website: 'https://example.com/nebulafi',
    socialLinks: demoSocialLinks('nebulafi'),
    status: 'active',
  },
  {
    id: 'demo-glyph-rewards',
    coinId: 2,
    name: 'Glyph Early Supporter Rewards',
    projectName: 'Glyph Markets',
    projectSymbol: 'GLYPH',
    projectLogoUrl: null,
    rewards: '50 USDC each + whitelist spots',
    winnersCount: 300,
    startsAt: '2026-09-08T00:00:00.000Z',
    endsAt: '2026-09-18T00:00:00.000Z',
    claimRewardsUrl: 'https://example.com/claim/glyph',
    website: 'https://example.com/glyph',
    socialLinks: demoSocialLinks('glyphmarkets'),
    status: 'scheduled',
  },
  {
    id: 'demo-moonkit',
    coinId: 3,
    name: 'MoonKit Community Sprint',
    projectName: 'MoonKit',
    projectSymbol: 'MOONK',
    projectLogoUrl: null,
    rewards: '1,000,000 MOONK shared pool',
    winnersCount: 5000,
    startsAt: '2026-09-01T00:00:00.000Z',
    endsAt: '2026-09-07T18:00:00.000Z',
    claimRewardsUrl: 'https://example.com/claim/moonkit',
    website: 'https://example.com/moonkit',
    socialLinks: demoSocialLinks('moonkit'),
    status: 'active',
  },

  {
    id: 'demo-signal-pass',
    coinId: 4,
    name: 'Signal Pass Claims',
    projectName: 'SignalPad',
    projectSymbol: 'SIG',
    projectLogoUrl: null,
    rewards: '10,000 SIG shared pool',
    winnersCount: 750,
    startsAt: '2026-09-10T00:00:00.000Z',
    endsAt: '2026-09-20T00:00:00.000Z',
    claimRewardsUrl: 'https://example.com/claim/signalpad',
    website: 'https://example.com/signalpad',
    socialLinks: demoSocialLinks('signalpad'),
    status: 'scheduled',
  },
  {
    id: 'demo-vault-points',
    coinId: 5,
    name: 'Vault Points Round',
    projectName: 'Vaultly',
    projectSymbol: 'VLT',
    projectLogoUrl: null,
    rewards: 'Bonus points and beta access',
    winnersCount: 2100,
    startsAt: '2026-09-03T00:00:00.000Z',
    endsAt: '2026-09-09T12:00:00.000Z',
    claimRewardsUrl: 'https://example.com/claim/vaultly',
    website: 'https://example.com/vaultly',
    socialLinks: demoSocialLinks('vaultly'),
    status: 'active',
  },
  {
    id: 'demo-ember-allocation',
    coinId: 6,
    name: 'Ember Allocation Drop',
    projectName: 'EmberSwap',
    projectSymbol: 'EMBER',
    projectLogoUrl: null,
    rewards: '300 EMBER each',
    winnersCount: 640,
    startsAt: '2026-09-15T00:00:00.000Z',
    endsAt: '2026-09-22T00:00:00.000Z',
    claimRewardsUrl: 'https://example.com/claim/emberswap',
    website: 'https://example.com/emberswap',
    socialLinks: demoSocialLinks('emberswap'),
    status: 'scheduled',
  },
  {
    id: 'demo-river-claim',
    coinId: 7,
    name: 'River Claim Week',
    projectName: 'RiverFi',
    projectSymbol: 'RVR',
    projectLogoUrl: null,
    rewards: 'Gas rebates + RVR tickets',
    winnersCount: 1400,
    startsAt: '2026-08-18T00:00:00.000Z',
    endsAt: '2026-08-30T00:00:00.000Z',
    claimRewardsUrl: 'https://example.com/claim/riverfi',
    website: 'https://example.com/riverfi',
    socialLinks: demoSocialLinks('riverfi'),
    status: 'expired',
  },
  {
    id: 'demo-arcade',
    coinId: 8,
    name: 'Arcade Quest Drop',
    projectName: 'PixelForge',
    projectSymbol: 'PXF',
    projectLogoUrl: null,
    rewards: 'Rare badge NFTs + 75,000 PXF',
    winnersCount: 888,
    startsAt: '2026-08-25T00:00:00.000Z',
    endsAt: '2026-09-04T23:59:00.000Z',
    claimRewardsUrl: 'https://example.com/claim/pixelforge',
    website: 'https://example.com/pixelforge',
    socialLinks: demoSocialLinks('pixelforge'),
    status: 'approved',
  },
] satisfies PublicAirdropRow[];
