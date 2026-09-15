'use client';

import { Brand } from '@/components/ui/brand';
import { Icon as IconifyIcon } from '@iconify/react';
import Link from 'next/link';

type SiteFooterProps = {
  id?: string;
  variant?: 'default' | 'home';
};

function getCurrentYear() {
  return new Date().getFullYear();
}

const exploreLinks = [
  { href: '/#leaderboard', label: 'Discover' },
  { href: '/airdrops', label: 'Airdrops' },
  { href: '/partners', label: 'Partners' },
  { href: '/advertise', label: 'Advertise' },
];

const platformLinks = [
  { href: '/?coins=top#leaderboard', label: 'Top coins' },
  { href: '/?coins=trending#leaderboard', label: 'Trending coins' },
  { href: '/?coins=presales#leaderboard', label: 'Presale coins' },
  { href: '/?coins=watched#leaderboard', label: 'Most watched' },
  { href: '/?coins=recent#leaderboard', label: 'Launched recently' },
];

const legalLinks = [
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: 'https://t.me/EndorseCoinSupport', label: 'Contact us', external: true },
];

export function SiteFooter({ id, variant = 'default' }: SiteFooterProps) {
  return (
    <footer className={`site-footer ${variant === 'home' ? 'site-footer--home' : ''}`} id={id}>
      <div className="container site-footer-inner">
        <div className="site-footer-branding">
          <Brand />
          <p className="site-footer-tagline">
            Discover new crypto projects, explore presale tokens, and vote on trending coins.
            Compare community rankings, watchlists, and find your next crypto gem.
          </p>
          <div className="site-footer-brand-socials" aria-label="EndorseCoin social links">
            <span>Follow us on:</span>
            <a
              href="https://x.com/endorsecoin"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="EndorseCoin on X"
              title="EndorseCoin on X"
            >
              <IconifyIcon icon="akar-icons:x-fill" aria-hidden="true" />
            </a>
            <a
              href="https://t.me/endorsecoin"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="EndorseCoin on Telegram"
              title="EndorseCoin on Telegram"
            >
              <IconifyIcon icon="akar-icons:telegram-fill" aria-hidden="true" />
            </a>
          </div>
          <div className="site-footer-mobile-meta">
            <span>
              <Link href="https://endorsecoin.com">www.endorsecoin.com</Link> © {getCurrentYear()}
            </span>
            <span>
              EndorseCoin does not offer and is not a financial advice. Remember to always do your
              own research.
            </span>
          </div>
        </div>
        <div className="site-footer-columns">
          <FooterColumn label="EXPLORE" links={exploreLinks} />
          <FooterColumn label="LEADERBOARD" links={platformLinks} />
          <FooterColumn label="LEGAL" links={legalLinks} />
          <div className="site-footer-column">
            <span>COMMUNITY</span>
            <a href="https://x.com/endorsecoin" target="_blank" rel="noopener noreferrer">
              <IconifyIcon icon="akar-icons:x-fill" aria-hidden="true" />
              X / Twitter
            </a>
            <a href="https://t.me/endorsecoin" target="_blank" rel="noopener noreferrer">
              <IconifyIcon icon="akar-icons:telegram-fill" aria-hidden="true" />
              Telegram
            </a>
          </div>
        </div>
        <div className="site-footer-bottom">
          <span>
            <Link href="https://endorsecoin.com">www.endorsecoin.com</Link> © {getCurrentYear()}
          </span>
          <span>
            EndorseCoin does not offer and is not a financial advice. Remember to always do your own
            research.
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  label,
  links,
}: {
  label: string;
  links: Array<{ href: string; label: string; external?: boolean }>;
}) {
  return (
    <nav className="site-footer-column" aria-label={`${label} links`}>
      <span>{label}</span>
      {links.map((link) =>
        link.external ? (
          <a href={link.href} key={link.href} target="_blank" rel="noopener noreferrer">
            {link.label}
          </a>
        ) : (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ),
      )}
    </nav>
  );
}
