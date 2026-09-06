import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RateLimitToaster } from '@/components/ui/rate-limit-toaster';
import { FixedFooterBannerLoader } from '@/features/ads/components/fixed-footer-banner-loader';
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
  metadataBase: new URL('https://endorsecoin.com'),
  title: {
    default: 'EndorseCoin — New Crypto Projects, Presales & Community Voting',
    template: '%s | EndorseCoin',
  },
  description:
    'Discover new crypto projects, token presales, trending coins, and weekly community-voted rankings across ETH, BSC, Solana, Base, Polygon, and more.',
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
    title: 'EndorseCoin — New Crypto Projects, Presales & Community Voting',
    description:
      'Track early crypto projects, vote every 12 hours, follow watchlists, and discover weekly community signals before they get crowded.',
    url: '/',
    siteName: 'EndorseCoin',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EndorseCoin — New Crypto Projects, Presales & Community Voting',
    description:
      'Discover new crypto projects, presales, trending coins, and weekly community-voted rankings.',
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
        {children}
        <Suspense fallback={null}>
          <FixedFooterBannerLoader />
        </Suspense>
        <RateLimitToaster />
      </body>
    </html>
  );
}
