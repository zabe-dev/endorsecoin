import { SiteHeader } from '@/components/layout/site-header';
import { JsonLd } from '@/components/seo/json-ld';
import { getActiveBannerAds } from '@/features/ads/server/banner-ads';
import { CoinDetailPage } from '@/features/coin-detail/components/coin-detail-page';
import { getPublicCoinById } from '@/features/coins/server/coin-list';
import { getPromotedCoinItems } from '@/features/coins/server/discovery';
import type { Coin } from '@/features/coins/types';
import { getCurrentSession } from '@/lib/auth/session';
import { createPublicPageMetadata, siteUrl } from '@/lib/seo/metadata';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../../../features/coin-detail/styles/coin-page.css';
import '../../market.css';

type CoinPageParams = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: CoinPageParams): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};

  const coin = await getPublicCoinById(Number(id));
  if (!coin) return {};

  const metadataCopy = buildCoinMetadataCopy(coin);

  return createPublicPageMetadata({
    title: metadataCopy.title,
    description: metadataCopy.description,
    path: `/coin/${coin.id}`,
    image: coin.logoUrl,
    twitterCard: coin.logoUrl ? 'summary' : 'summary_large_image',
  });
}

export default async function CoinPage({ params }: CoinPageParams) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const session = await getCurrentSession();
  const coin = await getPublicCoinById(Number(id), session?.user.id);
  if (!coin) notFound();
  const [promotedCoins, bannerAds] = await Promise.all([
    getPromotedCoinItems(session?.user.id),
    getActiveBannerAds(),
  ]);

  return (
    <>
      <SiteHeader active="none" initialSession={session} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Coins',
              item: siteUrl,
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: `${coin.name} (${coin.symbol})`,
              item: `${siteUrl}/coin/${coin.id}`,
            },
          ],
        }}
      />
      <CoinDetailPage
        coinRecord={coin}
        promotedCoins={promotedCoins}
        premiumBannerAds={bannerAds.premium}
        isSignedIn={Boolean(session?.user)}
      />
    </>
  );
}

function buildCoinMetadataCopy(coin: Coin) {
  const displayName = `${coin.name} (${coin.symbol})`;
  const hasContract = Boolean(coin.contractAddress);
  const hasOfficialLinks = coin.links.length > 0;
  const hasBuyLink = coin.dex.available || Boolean(coin.presale.websiteUrl);
  const details = [
    hasBuyLink ? 'where to buy' : 'available trading details',
    hasContract ? 'contract address' : '',
    hasOfficialLinks ? 'official links' : '',
    'community votes',
    'watchlist signals',
  ]
    .filter(Boolean)
    .join(', ')
    .replace(/, ([^,]*)$/, ', and $1');

  return {
    title: `${displayName} Live Price, Chart & Where To Buy`,
    description: trimMetaDescription(`Track ${displayName} live price and chart, plus ${details}.`),
  };
}

function trimMetaDescription(description: string) {
  const maxLength = 155;
  if (description.length <= maxLength) return description;

  const trimmed = description.slice(0, maxLength - 1);
  const lastSpace = trimmed.lastIndexOf(' ');
  return `${trimmed.slice(0, lastSpace > 120 ? lastSpace : trimmed.length).replace(/[,.]$/, '')}.`;
}
