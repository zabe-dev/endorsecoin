import { TopbarItems, TopbarMarquee } from '@/components/layout/topbar-marquee';
import { TopbarCoinLink } from '@/components/layout/topbar-coin-link';
import { getTopbarSummary } from '@/features/topbar/server/summary';
import type { TopbarSummary } from '@/features/topbar/types';

const loadingSummary: TopbarSummary = {
  prices: [
    { symbol: 'BTC', price: null, change: null },
    { symbol: 'ETH', price: null, change: null },
    { symbol: 'SOL', price: null, change: null },
    { symbol: 'BNB', price: null, change: null },
  ],
  users: null,
  projects: null,
  totalVotes: null,
  trendingCoin: null,
  topVotedCoin: null,
};

export async function Topbar() {
  const summary = await getTopbarSummary();
  return <TopbarShell summary={summary} />;
}

export function TopbarFallback() {
  return <TopbarShell summary={loadingSummary} />;
}

function TopbarShell({ summary }: { summary: TopbarSummary }) {
  return (
    <div className="topbar-band">
      <div className="container topbar">
        <div className="ticker">
          <TopbarItems summary={summary} pricesOnly />
        </div>
        <div className="platform-stats">
          <TopbarPlatformItems summary={summary} />
        </div>
        <TopbarMarquee summary={summary} />
      </div>
    </div>
  );
}

function TopbarPlatformItems({ summary }: { summary: TopbarSummary }) {
  return (
    <>
      <TopbarCoinLink coin={summary.topVotedCoin} kind="top-voted" />
      <TopbarCoinLink coin={summary.trendingCoin} kind="trending" />
      <span>
        <span className="topbar-label">Users</span>
        <b className="topbar-value">{formatCompactNumber(summary.users)}</b>
      </span>
      <span>
        <span className="topbar-label">Projects</span>
        <b className="topbar-value">{formatCompactNumber(summary.projects)}</b>
      </span>
      <span>
        <span className="topbar-label">Total votes</span>
        <b className="topbar-value">{formatCompactNumber(summary.totalVotes)}</b>
      </span>
    </>
  );
}

function formatCompactNumber(value: number | null) {
  if (value === null) return '—';
  return Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}
