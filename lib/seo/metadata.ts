import type { Metadata } from 'next';

export const siteUrl = 'https://endorsecoin.com';
export const siteName = 'EndorseCoin';
export const homeTitle = 'Discover New Crypto Coins, Presales and Airdrops | EndorseCoin';
export const homeDescription =
  'Discover new crypto projects, explore presale tokens, and vote on trending coins. Compare community rankings, watchlists, and find your next crypto gem.';
const r2PublicUrl = trimTrailingSlash(process.env.R2_PUBLIC_URL || '');
const defaultSocialImage = 'https://assets.endorsecoin.com/site/image-1200x628.png';

export const socialImage =
  process.env.NEXT_PUBLIC_SOCIAL_IMAGE_URL ||
  (r2PublicUrl ? `${r2PublicUrl}/site/image-1200x628.png` : defaultSocialImage);
export const summaryImage = '/logo.png';

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
  const twitterImage = image || (twitterCard === 'summary' ? summaryImage : socialImage);

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    other: {
      title: displayTitle,
    },
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
      images: [twitterImage],
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

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/u, '');
}
