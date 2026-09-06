import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/layout/site-header';
import { JsonLd } from '@/components/seo/json-ld';
import { CoinDetailPage } from '@/features/coin-detail/components/coin-detail-page';
import { getActiveBannerAds } from '@/features/ads/server/banner-ads';
import { getPublicCoinById } from '@/features/coins/server/coin-list';
import { getPromotedCoinItems } from '@/features/coins/server/discovery';
import type { Coin } from '@/features/coins/types';
import { getCurrentSession } from '@/lib/auth/session';
import { createPublicPageMetadata, siteUrl } from '@/lib/seo/metadata';
import '../../market.css';
import '../../../features/coin-detail/styles/coin-page.css';

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
  const hasPrice = typeof coin.market.priceUsd === 'number';
  const hasChart = coin.chart.source !== 'unavailable';
  const hasBuyLink = coin.dex.available || Boolean(coin.presale.websiteUrl);
  const hasContract = Boolean(coin.contractAddress);
  const hasOfficialLinks = coin.links.length > 0;

  if (hasPrice && hasChart && hasBuyLink) {
    return {
      title: `${displayName} Price, Chart & Where to Buy`,
      description:
        [
          `Check ${displayName} price and chart`,
          'explore where to buy',
          hasContract ? 'find the contract address' : '',
          hasOfficialLinks ? 'official links' : '',
        ]
          .filter(Boolean)
          .join(', ')
          .replace(/, ([^,]*)$/, ', and $1') + '.',
    };
  }

  if (hasPrice && hasChart) {
    return {
      title: `${displayName} Price & Chart`,
      description:
        [
          `Check ${displayName} price and chart`,
          hasContract ? 'find the contract address' : '',
          hasOfficialLinks ? 'official links' : '',
          'community activity',
        ]
          .filter(Boolean)
          .join(', ')
          .replace(/, ([^,]*)$/, ', and $1') + '.',
    };
  }

  return {
    title: `${displayName} Token Details & Official Links`,
    description:
      [
        `Learn about ${displayName}`,
        hasContract ? 'find the contract address' : '',
        hasOfficialLinks ? 'official links' : '',
        'community activity',
      ]
        .filter(Boolean)
        .join(', ')
        .replace(/, ([^,]*)$/, ', and $1') + '.',
  };
}
