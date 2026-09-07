import { JsonLd } from '@/components/seo/json-ld';
import { RateLimitToaster } from '@/components/ui/rate-limit-toaster';
import { FixedFooterBannerLoader } from '@/features/ads/components/fixed-footer-banner-loader';
import {
  homeDescription,
  homeTitle,
  siteName,
  siteUrl,
  socialImage,
  summaryImage,
} from '@/lib/seo/metadata';
import type { Metadata } from 'next';
import { Fira_Mono, JetBrains_Mono, Poppins, Space_Grotesk } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

const firaMono = Fira_Mono({
  variable: '--font-fira-mono',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: homeTitle,
    template: '%s | EndorseCoin',
  },
  description: homeDescription,
  other: {
    title: homeTitle,
  },
  keywords: [
    'new crypto projects',
    'crypto voting',
    'crypto presales',
    'trending crypto coins',
    'new tokens',
    'meme coins',
    'DeFi tokens',
    'community crypto rankings',
    'crypto watchlist',
    'crypto currency',
    'crypto trading',
    'crypto news today',
    'crypto investments',
    'crypto coins',
    'discover crypto',
    'best crypto coin to buy',
    'best crypto',
    'new crypto coins',
    'all crypto coins',
    'coin listings',
    'new cryptocurrency',
    'new to crypto',
    'popular crypto coin',
    'best crypto presale',
    'presale crypto',
    'presale coins',
    'crypto presale',
    'presale token',
    'tokens crypto',
    'best coins',
    'most promising crypto',
    'best crypto presales',
    'upcoming crypto coins',
    'best new crypto',
    'new crypto coins coming out',
    'new crypto presale',
    'upcoming crypto presales',
    'crypto coin site',
    'promising crypto coins',
    'new crypto listings',
    'most popular crypto coins',
    'find new crypto coins',
    'ai crypto',
    'pepe crypto',
    'ai crypto coins',
    'best ai crypto coins',
    'crypto ai coins',
    'endorsecoin',
  ],
  alternates: {
    canonical: '/',
  },
  manifest: '/site.webmanifest',
  icons: {
    apple: [{ url: summaryImage, sizes: '256x256', type: 'image/png' }],
    icon: [{ url: summaryImage, type: 'image/png', sizes: '256x256' }],
  },
  openGraph: {
    title: homeTitle,
    description: homeDescription,
    url: '/',
    siteName,
    type: 'website',
    images: [{ url: socialImage }],
  },
  twitter: {
    card: 'summary_large_image',
    title: homeTitle,
    description: homeDescription,
    images: [socialImage],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body
        className={`${poppins.variable} ${spaceGrotesk.variable} ${firaMono.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Organization',
                '@id': `${siteUrl}/#organization`,
                name: siteName,
                url: siteUrl,
                logo: `${siteUrl}${summaryImage}`,
              },
              {
                '@type': 'WebSite',
                '@id': `${siteUrl}/#website`,
                name: siteName,
                url: siteUrl,
                publisher: {
                  '@id': `${siteUrl}/#organization`,
                },
              },
            ],
          }}
        />
        {children}
        <Suspense fallback={null}>
          <FixedFooterBannerLoader />
        </Suspense>
        <RateLimitToaster />
      </body>
    </html>
  );
}
