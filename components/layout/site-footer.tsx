'use client';

import { Brand } from '@/components/ui/brand';
import Link from 'next/link';

type SiteFooterProps = {
  id?: string;
  variant?: 'default' | 'home';
};

function getCurrentYear() {
  return new Date().getFullYear();
}

const footerLinks = [
  { href: '/#leaderboard', label: 'Discover' },
  { href: '/airdrops', label: 'Airdrops' },
  { href: '/partners', label: 'Partners' },
  { href: '/advertise', label: 'Advertise' },
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms' },
];

export function SiteFooter({ id, variant = 'default' }: SiteFooterProps) {
  return (
    <footer className={`site-footer ${variant === 'home' ? 'site-footer--home' : ''}`} id={id}>
      <div className="container site-footer-inner">
        <div className="site-footer-branding">
          <Brand />
          <p className="site-footer-tagline">
            Community-powered coin discovery for launches, presales, and early signals.
          </p>
          <p className="site-footer-meta">
            <Link href="https://endorsecoin.com">www.endorsecoin.com</Link> © {getCurrentYear()}
          </p>
        </div>
        <nav className="site-footer-links" aria-label="Footer navigation">
          {footerLinks.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
