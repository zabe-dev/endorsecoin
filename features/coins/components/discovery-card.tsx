'use client';
/* eslint-disable @next/next/no-img-element -- Project logos can come from submitted URLs later. */

import { formatVotes, type CoinListItem as Coin } from '@/features/coins/view';
import Link from 'next/link';
import { BoltIcon, DiscoveryIcon } from './icons';

export function DiscoveryCard({
  icon,
  title,
  sub,
  coins,
  viewMoreHref,
  metric = 'votes',
}: {
  icon: 'new' | 'trend' | 'presale' | 'watch';
  title: string;
  sub: string;
  coins: Coin[];
  viewMoreHref: string;
  metric?: 'votes' | 'launch' | 'presaleEnd' | 'watchlist' | 'trend';
}) {
  const rows = Array.from({ length: 4 }, (_, index) => coins[index] || null);

  return (
    <article className={`discovery-card discovery-card-${icon}`}>
      <div className="discovery-heading">
        <DiscoveryIcon type={icon} />
        <span>
          <h3>{title}</h3>
          <small>{sub}</small>
        </span>
        <a className="discovery-view-more" href={viewMoreHref}>
          View more →
        </a>
      </div>
      {rows.map((coin, index) =>
        coin ? (
          <Link className="mini-coin" href={`/coin/${coin.coinId}`} key={coin.coinId}>
            <b>{index + 1}</b>
            <div className={`coin-logo ${coin.color}`}>
              {coin.image ? <img src={coin.image} alt="" /> : coin.logo}
            </div>
            <span>
              <strong
                className={`mini-coin-name ${coin.boost === 500 ? 'gold-name gold-name-animated' : ''}`}
              >
                <span>{coin.name}</span>
                {coin.boost && (
                  <em className={`mini-boost boost-badge boost-${coin.boost}`}>
                    <BoltIcon />
                    {coin.boost}×
                  </em>
                )}
              </strong>
              <small>
                {coin.symbol} · {coin.chain}
              </small>
            </span>
            <Metric coin={coin} metric={metric} />
          </Link>
        ) : (
          <div className="mini-coin mini-coin-empty" key={`empty-${index}`}>
            <b>{index + 1}</b>
            <div className="coin-logo">-</div>
            <span>
              <strong>-</strong>
              <small>-</small>
            </span>
            <strong className="mini-coin-metric">-</strong>
          </div>
        ),
      )}
    </article>
  );
}

function Metric({
  coin,
  metric,
}: {
  coin: Coin;
  metric: 'votes' | 'launch' | 'presaleEnd' | 'watchlist' | 'trend';
}) {
  if (metric === 'trend' || metric === 'votes' || metric === 'watchlist') {
    return (
      <strong className={`mini-coin-metric mini-coin-votes metric-${metric}`}>
        <b>
          {formatVotes(
            metric === 'watchlist' ? coin.watchCount : metric === 'trend' ? coin.votes : coin.votes,
          )}
        </b>
        <span>{metric === 'watchlist' ? 'watchlists' : 'total votes'}</span>
      </strong>
    );
  }

  return (
    <strong className={`mini-coin-metric metric-${metric}`}>{formatMetric(coin, metric)}</strong>
  );
}

function formatMetric(
  coin: Coin,
  metric: 'votes' | 'launch' | 'presaleEnd' | 'watchlist' | 'trend',
) {
  if (metric === 'launch') return coin.launch;
  if (metric === 'presaleEnd')
    return coin.presaleEnd === '—' ? 'No end date' : `${coin.presaleEnd}`;
  if (metric === 'watchlist') return `${formatVotes(coin.watchCount)} watches`;
  return `${formatVotes(coin.votes)} votes`;
}
