import type { Metadata } from 'next';
import { Suspense } from 'react';
import { JsonLd } from '@/components/seo/json-ld';
import { RateLimitToaster } from '@/components/ui/rate-limit-toaster';
import { FixedFooterBannerLoader } from '@/features/ads/components/fixed-footer-banner-loader';
import { homeDescription, homeTitle, siteName, siteUrl, socialImage } from '@/lib/seo/metadata';
import { Fira_Mono, JetBrains_Mono, Poppins, Space_Grotesk } from 'next/font/google';
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
    'EndorseCoin',
  ],
  alternates: {
    canonical: '/',
  },
  manifest: '/site.webmanifest',
  icons: {
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    icon: [
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
    ],
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
                logo: `${siteUrl}/android-chrome-512x512.png`,
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
