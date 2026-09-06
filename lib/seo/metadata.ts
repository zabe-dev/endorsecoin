import type { Metadata } from 'next';

export const siteUrl = 'https://endorsecoin.com';
export const siteName = 'EndorseCoin';
export const homeTitle = 'Discover New Crypto Coins, Presales and Airdrops | EndorseCoin';
export const homeDescription =
  'Discover new coins, explore token presales, and compare trending projects. Check prices, charts, and community rankings to research your next investment.';
export const socialImage = '/opengraph-image';

type PublicPageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
  image?: string | null;
  twitterCard?: 'summary' | 'summary_large_image';
  robots?: Metadata['robots'];
};

export function createPublicPageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  image,
  twitterCard = 'summary_large_image',
  robots,
}: PublicPageMetadataOptions): Metadata {
  const displayTitle = absoluteTitle ? title : `${title} | ${siteName}`;
  const images = image ? [{ url: image }] : [{ url: socialImage }];

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: displayTitle,
      description,
      url: path,
      siteName,
      type: 'website',
      images,
    },
    twitter: {
      card: twitterCard,
      title: displayTitle,
      description,
      images: image ? [image] : [socialImage],
    },
    robots,
  };
}

export function createPrivatePageMetadata(title: string, path: string): Metadata {
  return {
    title,
    alternates: {
      canonical: path,
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}
