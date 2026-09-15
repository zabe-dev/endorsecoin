import { getLeaderboardPage } from '@/features/coins/server/leaderboard';
import type { CoinListItem } from '@/features/coins/view';
import type { Metadata } from 'next';
import { FittedCoinName } from './fitted-coin-name';
import './daily-recap.css';

/* eslint-disable @next/next/no-img-element -- Recap uses user-submitted external coin logos without a fixed remote image domain list. */

export const metadata: Metadata = {
  title: 'Daily Recap',
  description: "Today's EndorseCoin ranking summary.",
  robots: {
    index: false,
    follow: true,
  },
};

export const dynamic = 'force-dynamic';

type RecapSection = {
  label: string;
  rows: CoinListItem[];
  metric: (coin: CoinListItem) => string;
};

const sectionSize = 3;

export default async function DailyRecapPage() {
  const generatedAt = new Date();
  const [top, gainers, trending, presales, watched, recent] = await Promise.all([
    getLeaderboardPage({ view: 'top', pageSize: sectionSize }),
    getLeaderboardPage({
      view: 'top',
      sort: 'change',
      direction: 'desc',
      pageSize: sectionSize,
    }),
    getLeaderboardPage({ view: 'trending', pageSize: sectionSize }),
    getLeaderboardPage({ view: 'presales', pageSize: sectionSize }),
    getLeaderboardPage({ view: 'watched', pageSize: sectionSize }),
    getLeaderboardPage({ view: 'recent', pageSize: sectionSize }),
  ]);

  const sections: RecapSection[] = [
    {
      label: 'TOP RANKED',
      rows: top.rows,
      metric: (coin) => `${formatCompact(coin.votes)} votes`,
    },
    {
      label: '24H GAINERS',
      rows: gainers.rows,
      metric: (coin) => formatPercent(coin.change),
    },
    {
      label: 'TRENDING TODAY',
      rows: trending.rows,
      metric: (coin) => `${formatCompact(coin.recentVotes)} new votes`,
    },
    {
      label: 'PRESALES',
      rows: presales.rows,
      metric: (coin) => coin.presaleEnd === '—' ? 'Presale live' : coin.presaleEnd,
    },
    {
      label: 'MOST WATCHED',
      rows: watched.rows,
      metric: (coin) => `${formatCompact(coin.watchCount)} watches`,
    },
    {
      label: 'NEW LAUNCHES',
      rows: recent.rows,
      metric: (coin) => coin.launch,
    },
  ];

  return (
    <main className="daily-recap-page">
      <section className="daily-recap-card" aria-label="EndorseCoin Daily Recap">
        <header className="daily-recap-header">
          <img src="/logo.svg" alt="" className="daily-recap-brand-mark" />
          <h1>EndorseCoin Daily Recap</h1>
        </header>

        <div className="daily-recap-sections">
          {sections.map((section) => (
            <RecapSectionBlock key={section.label} section={section} />
          ))}
        </div>

        <footer className="daily-recap-footer">
          <div className="daily-recap-brand">
            <img src="/logo.svg" alt="" />
            <span>endorsecoin</span>
          </div>
          <time dateTime={generatedAt.toISOString()}>{`Update: ${formatRecapDate(generatedAt)}`}</time>
          <span>@EndorseCoin</span>
        </footer>
      </section>
    </main>
  );
}

function RecapSectionBlock({ section }: { section: RecapSection }) {
  const rows = section.rows.slice(0, sectionSize);
  const headingId = `daily-recap-${section.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <section className="daily-recap-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{section.label}</h2>
      {rows.length ? (
        <ol className="daily-recap-grid">
          {rows.map((coin) => (
            <li key={coin.coinId} className="daily-recap-coin">
              <a href={`/coin/${coin.coinId}`} aria-label={`${coin.name} daily recap rank ${coin.rank}`}>
                <span className="daily-recap-rank">{coin.rank}</span>
                <CoinLogo coin={coin} />
                <FittedCoinName name={coin.name} />
                <span>{section.metric(coin)}</span>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="daily-recap-empty">No ranked coins yet.</p>
      )}
    </section>
  );
}

function CoinLogo({ coin }: { coin: CoinListItem }) {
  if (coin.image) {
    return <img src={coin.image} alt="" className="daily-recap-logo" loading="lazy" />;
  }

  return (
    <span className="daily-recap-logo daily-recap-logo-fallback" aria-hidden="true">
      {coin.logo}
    </span>
  );
}

function formatCompact(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatRecapDate(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
}
