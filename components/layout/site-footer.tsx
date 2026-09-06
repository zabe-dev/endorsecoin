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

export function SiteFooter({ id, variant = 'default' }: SiteFooterProps) {
  return (
    <footer className={`site-footer ${variant === 'home' ? 'site-footer--home' : ''}`} id={id}>
      <div className="container site-footer-inner">
        <div className="site-footer-branding">
          <Brand />
          <p>
            <Link href="https://endorsecoin.com">www.endorsecoin.com</Link> © {getCurrentYear()} ·
            Community-powered crypto discovery.
          </p>
        </div>
        <div className="site-footer-columns">
          <div className="site-footer-column">
            <span>Navigation</span>
            <Link href="/#leaderboard">Discover</Link>
            <span className="site-footer-muted-link">Airdrops</span>
            <Link href="/partners">Partners</Link>
            <Link href="/advertise">Advertise</Link>
          </div>
          <div className="site-footer-column">
            <span>Leaderboard</span>
            <Link href="/?coins=top#leaderboard">Top coins</Link>
            <Link href="/?coins=trending#leaderboard">Trending coins</Link>
            <Link href="/?coins=presales#leaderboard">Presale coins</Link>
            <Link href="/?coins=watched#leaderboard">Most watched</Link>
            <Link href="/?coins=recent#leaderboard">Recently launched</Link>
          </div>
          <div className="site-footer-column">
            <span>Submissions</span>
            <Link href="/submit">Submit coin</Link>
            <span className="site-footer-muted-link">Submit airdrop</span>
            <span className="site-footer-group-label">Socials</span>
            <Link
              className="site-footer-social-link"
              href="https://t.me/EndorseCoinSupport"
              target="_blank"
              rel="noreferrer"
            >
              Telegram
            </Link>
            <Link
              className="site-footer-social-link"
              href="https://x.com/EndorseCoin"
              target="_blank"
              rel="noreferrer"
            >
              X / Twitter
            </Link>
          </div>
          <div className="site-footer-column">
            <span>Legal</span>
            <Link href="/disclaimer">Disclaimer</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
