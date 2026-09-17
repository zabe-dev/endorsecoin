import { JsonLd } from '@/components/seo/json-ld';
import { NETWORKS } from '@/features/coins/networks';
import { getLeaderboardPage } from '@/features/coins/server/leaderboard';
import { getCurrentVoteWeekStart } from '@/features/coins/server/interactions';
import type { CoinListItem } from '@/features/coins/view';
import { cacheKeyPart } from '@/lib/cache/cache-key';
import { getCacheVersion } from '@/lib/cache/cache-version';
import { rememberJson } from '@/lib/cache/json-cache';
import { createPublicPageMetadata, siteName, siteUrl } from '@/lib/seo/metadata';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SaveDigestImageButton } from './save-digest-image-button';
import './digest.css';

/* eslint-disable @next/next/no-img-element -- Coin logos use user-submitted external URLs. */

const widgetSize = 10;
const digestCacheSeconds = Number(process.env.DIGEST_CACHE_SECONDS || 60);
const chainConfigs = Object.values(NETWORKS).filter((network) => network.enabled);
const digestSocialImage = `${siteUrl}/image-1200x628.png`;

type DigestWidget = {
  key: string;
  title: string;
  eyebrow: string;
  query: {
    view?: 'top' | 'trending' | 'presales' | 'watched' | 'recent';
    sort?: string;
    direction?: string;
    chain?: string;
  };
  shareParams: string;
  chainIcon?: string | null;
};

const widgets: DigestWidget[] = [
  {
    key: 'top',
    title: 'Top Ranked',
    eyebrow: 'WEEKLY VOTES',
    query: { view: 'top' },
    shareParams: 'leaderboard=top',
  },
  {
    key: 'gainers',
    title: '24H Gainers',
    eyebrow: 'PRICE CHANGE',
    query: { view: 'top', sort: 'change', direction: 'desc' },
    shareParams: 'leaderboard=gainers',
  },
  {
    key: 'trending',
    title: 'Trending',
    eyebrow: 'RECENT ACTIVITY',
    query: { view: 'trending' },
    shareParams: 'leaderboard=trending',
  },
  {
    key: 'presales',
    title: 'Presales',
    eyebrow: 'ACTIVE PRESALES',
    query: { view: 'presales' },
    shareParams: 'leaderboard=presales',
  },
  {
    key: 'watched',
    title: 'Most Watched',
    eyebrow: 'WATCHLISTS',
    query: { view: 'watched' },
    shareParams: 'leaderboard=watched',
  },
  {
    key: 'recent',
    title: 'Launched Recently',
    eyebrow: 'RECENTLY LIVE',
    query: { view: 'recent' },
    shareParams: 'leaderboard=recent',
  },
];

const chainWidgets: DigestWidget[] = chainConfigs.map((chain) => ({
  key: `chain-${chain.id}`,
  title: chain.name,
  eyebrow: 'TOP RANKED ON CHAIN',
  query: { view: 'top', chain: chain.shortName },
  shareParams: `chain=${encodeURIComponent(chain.id)}`,
  chainIcon: chain.iconUrl,
}));

type DigestParams = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: DigestParams): Promise<Metadata> {
  const params = await searchParams;
  const leaderboardKey = readParam(params?.leaderboard) ?? readParam(params?.widget);
  const widget = widgets.find((item) => item.key === leaderboardKey);
  const chain = chainWidgets.find((item) => item.key === `chain-${readParam(params?.chain)}`);
  const title = chain
    ? `${chain.title} Weekly Digest`
    : widget
      ? `${widget.title} Weekly Digest`
      : 'Weekly Ranking Digest';
  const description = chain
    ? `Top community-ranked ${chain.title} coins this week on EndorseCoin.`
    : widget
      ? `${widget.title} crypto rankings this week on EndorseCoin.`
      : 'Top community-ranked crypto coins across market signals this week on EndorseCoin.';
  const query = new URLSearchParams();
  if (widget) query.set('leaderboard', widget.key);
  if (chain) query.set('chain', chain.key.replace('chain-', ''));
  return createPublicPageMetadata({
    title,
    description,
    path: query.size ? `/digest?${query}` : '/digest',
    image: digestSocialImage,
  });
}

export const dynamic = 'force-dynamic';

export default async function DigestPage({ searchParams }: DigestParams) {
  const params = await searchParams;
  const leaderboardKey = readParam(params?.leaderboard) ?? readParam(params?.widget);
  const selectedWidget = widgets.find((item) => item.key === leaderboardKey);
  const selectedChain = chainWidgets.find(
    (item) => item.key === `chain-${readParam(params?.chain)}`,
  );
  const activeWidgets: DigestWidget[] = selectedChain
    ? [selectedChain]
    : selectedWidget
      ? [selectedWidget]
      : [...widgets, ...chainWidgets];
  const weekStart = getCurrentVoteWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const leaderboardVersion = await getCacheVersion('leaderboard');
  const digestCacheKey = [
    'digest',
    leaderboardVersion,
    selectedChain?.key || '',
    selectedWidget?.key || '',
    'v1',
  ]
    .map(cacheKeyPart)
    .join(':');
  const sections = await rememberJson(digestCacheKey, { ttlSeconds: digestCacheSeconds }, () =>
    Promise.all(
      activeWidgets.map(async (widget) => ({
        widget,
        rows: (await getLeaderboardPage({ ...widget.query, pageSize: widgetSize })).rows,
      })),
    ),
  );
  const marketSections = sections
    .slice(0, selectedChain || selectedWidget ? sections.length : widgets.length)
    .filter(({ rows }) => rows.length > 0);
  const chainSections = sections.slice(widgets.length).filter(({ rows }) => rows.length > 0);
  const title = selectedChain
    ? `${selectedChain.title} Weekly Digest`
    : selectedWidget
      ? `${selectedWidget.title} Weekly Digest`
      : 'Weekly Digest';
  const description = selectedChain
    ? `Top ranked coins on ${selectedChain.title} this week.`
    : selectedWidget
      ? `${selectedWidget.title} coins ranked by this week's EndorseCoin signal.`
      : 'Six weekly market signals, ranked by the EndorseCoin community.';
  const isSingleDigest = Boolean(selectedWidget || selectedChain);
  return (
    <main className="digest-page">
      <div className="digest-shell">
        <header className="digest-header">
          <div>
            <Link href="/" className="digest-kicker">
              ENDORSECOIN / MARKET SIGNAL
            </Link>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <div className="digest-header-actions">
            <span className="digest-period">
              {formatDate(weekStart)} - {formatDate(weekEnd)}
            </span>
          </div>
        </header>
        <div className={isSingleDigest ? 'digest-toolbar digest-toolbar-single' : 'digest-toolbar'}>
          {!isSingleDigest && <span>WEEKLY SNAPSHOT</span>}
          {isSingleDigest ? (
            <Link href="/digest">View full digest</Link>
          ) : (
            <span>TOP 10 PER WIDGET</span>
          )}
        </div>
        <div className={isSingleDigest ? 'digest-grid digest-grid-single' : 'digest-grid'}>
          {marketSections.map(({ widget, rows }) => (
            <DigestWidget key={widget.key} widget={widget} rows={rows} />
          ))}
        </div>
        {!selectedChain && !selectedWidget && chainSections.length > 0 && (
          <>
            <h2 className="digest-group-title">Top Ranked By Chain</h2>
            <div className="digest-grid">
              {chainSections.map(({ widget, rows }) => (
                <DigestWidget key={widget.key} widget={widget} rows={rows} />
              ))}
            </div>
          </>
        )}
        <footer className="digest-footer">
          <Link href="/" className="digest-footer-brand">
            <img src="/logo.svg" alt="" />
            <span>{siteName}</span>
          </Link>
          <span>Rankings reset every Monday</span>
          <Link href="/digest" className="digest-footer-link">
            endorsecoin.com/digest
          </Link>
        </footer>
      </div>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          url: `${siteUrl}/digest`,
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: sections.flatMap(({ rows }) =>
              rows.map((coin) => ({
                '@type': 'ListItem',
                position: coin.rank,
                name: `${coin.name} (${coin.symbol})`,
                url: `${siteUrl}/coin/${coin.coinId}`,
              })),
            ),
          },
        }}
      />
    </main>
  );
}

function DigestWidget({ widget, rows }: { widget: DigestWidget; rows: CoinListItem[] }) {
  if (!rows.length) return null;

  const headingId = `digest-${widget.key}`;
  return (
    <section id={`digest-card-${widget.key}`} className="digest-widget" aria-labelledby={headingId}>
      <header className="digest-widget-header">
        <div
          className={
            widget.chainIcon
              ? 'digest-widget-title digest-widget-title-logo'
              : 'digest-widget-title'
          }
        >
          <span className="digest-widget-label">{widget.eyebrow}</span>
          {widget.chainIcon && <img src={widget.chainIcon} alt="" className="digest-chain-logo" />}
          <h2 id={headingId}>{widget.title}</h2>
        </div>
        <SaveDigestImageButton
          targetId={`digest-card-${widget.key}`}
          filename={`endorsecoin-${widget.key}.png`}
        />
      </header>
      <ol className="digest-list">
        {rows.map((coin, index) => (
          <li key={coin.coinId}>
            <Link href={`/coin/${coin.coinId}`} className="digest-coin">
              <span className="digest-rank">{String(index + 1).padStart(2, '0')}</span>
              <CoinLogo coin={coin} />
              <span className="digest-coin-copy">
                <strong>{coin.name}</strong>
                <span>
                  {coin.symbol} <i aria-hidden="true">/</i> {coin.chain}
                </span>
              </span>
              <span className="digest-votes">
                {formatMetric(widget.key, coin)} <small>{formatMetricLabel(widget.key)}</small>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CoinLogo({ coin }: { coin: CoinListItem }) {
  return coin.image ? (
    <img src={coin.image} alt="" className="digest-logo" loading="lazy" />
  ) : (
    <span className="digest-logo digest-logo-fallback" aria-hidden="true">
      {coin.logo}
    </span>
  );
}

function formatMetric(key: string, coin: CoinListItem) {
  if (key === 'gainers') return `${coin.change > 0 ? '+' : ''}${coin.change.toFixed(2)}`;
  const value =
    key === 'trending' ? coin.recentVotes : key === 'watched' ? coin.watchCount : coin.votes;
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

function formatMetricLabel(key: string) {
  if (key === 'gainers') return '%';
  if (key === 'watched') return 'watchlists';
  return 'votes';
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}
