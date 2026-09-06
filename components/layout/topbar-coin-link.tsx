/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { Crown, Flame } from 'lucide-react';
import type { TopbarCoinLink as TopbarCoinLinkData } from '@/features/topbar/types';

type TopbarCoinLinkProps = {
  coin: TopbarCoinLinkData;
  kind: 'trending' | 'top-voted';
};

const labels = {
  trending: 'Trending',
  'top-voted': 'Top voted',
} as const;

export function TopbarCoinLink({ coin, kind }: TopbarCoinLinkProps) {
  if (!coin) return null;

  const Icon = kind === 'trending' ? Flame : Crown;
  const isGolden = coin.boost === 500;
  const hasBoost = Boolean(coin.boost);

  return (
    <Link className="topbar-coin-link" href={`/coin/${coin.id}`}>
      <Icon
        className={kind === 'trending' ? 'topbar-flame-icon' : 'topbar-crown-icon'}
        aria-hidden="true"
      />
      <span className="topbar-coin-label">{labels[kind]}</span>
      {coin.logoUrl ? (
        <img className="topbar-coin-logo" src={coin.logoUrl} alt="" />
      ) : (
        <span className="topbar-coin-logo topbar-coin-logo-fallback">
          {coin.symbol.slice(0, 1)}
        </span>
      )}
      <b className={`topbar-coin-name ${isGolden ? 'gold-name gold-name-animated' : ''}`}>
        {coin.name}
      </b>
      {hasBoost && (
        <span className={`topbar-boost-badge boost-badge boost-${coin.boost}`}>
          <TopbarBoltIcon />
          {coin.boost}×
        </span>
      )}
    </Link>
  );
}

function TopbarBoltIcon() {
  return (
    <svg className="bolt-icon" aria-hidden="true" viewBox="0 0 448 512">
      <path
        fill="currentColor"
        d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288h111.5L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3S397.3 224 384 224H272.5l76.9-179.4z"
      />
    </svg>
  );
}
