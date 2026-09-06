'use client';
/* eslint-disable @next/next/no-img-element -- Chain dropdown needs a remote Iconify SVG for Other alongside local icon files. */
import { DiscoveryGuide } from '@/components/layout/discovery-guide';
import { MailingListSignup } from '@/components/layout/mailing-list-signup';
import { SiteFooter } from '@/components/layout/site-footer';
import { BasicAdBannerPair, PremiumAdBanner } from '@/features/ads/components/ad-banners';
import type { BannerAdMap } from '@/features/ads/types';
import { AuthModal } from '@/features/auth/components/auth-modal';
import {
  CoinCells as Cells,
  DiscoveryCard as Discovery,
  LineBurst,
  SortHeader as SH,
  CoinTable as SimpleTable,
  TableScroller,
  SectionTitle as Title,
  WatchButton as Watch,
} from '@/features/coins/components';
import type { DiscoveryHotspots } from '@/features/coins/discovery-types';
import type {
  LeaderboardPage as ServerLeaderboardPage,
  LeaderboardView as ServerLeaderboardView,
} from '@/features/coins/leaderboard-types';
import {
  coinCategories,
  coinChainChoices,
  getBoostVoteFactor,
  type CoinListItem,
  type CoinSortKey,
} from '@/features/coins/view';
import { WeeklyResetChip } from '@/features/leaderboard/components/weekly-reset-chip';
import { showRateLimitToast } from '@/lib/api/rate-limit-toast';
import { getPaginationItems } from '@/lib/ui/pagination';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react';
/* Market data and reusable UI live in dedicated modules; this page owns orchestration state. */

type LeaderboardLabel =
  'Top coins' | 'Trending coins' | 'Presale coins' | 'Most watched' | 'Launched recently';

const viewParams: Record<LeaderboardLabel, ServerLeaderboardView> = {
  'Top coins': 'top',
  'Trending coins': 'trending',
  'Presale coins': 'presales',
  'Most watched': 'watched',
  'Launched recently': 'recent',
};
const defaultSort: { key: CoinSortKey; dir: 1 | -1 } = { key: 'votes', dir: -1 };

export function HomeClient({
  initialHotspots,
  initialPromotedCoins,
  initialLeaderboard,
  isSignedIn,
  bannerAds,
}: {
  initialHotspots: DiscoveryHotspots;
  initialPromotedCoins: CoinListItem[];
  initialLeaderboard: ServerLeaderboardPage;
  isSignedIn: boolean;
  bannerAds: BannerAdMap;
}) {
  const [hotspotCoins, setHotspotCoins] = useState<DiscoveryHotspots>(initialHotspots);
  const [promotedCoins, setPromotedCoins] = useState<CoinListItem[]>(initialPromotedCoins);
  const [leaderboardPage, setLeaderboardPage] = useState<ServerLeaderboardPage>(initialLeaderboard);
  const initialInteractiveCoins = [
    ...Object.values(initialHotspots).flat(),
    ...initialPromotedCoins,
    ...initialLeaderboard.rows,
  ];
  const [view, setView] = useState<LeaderboardLabel>(serverViewToLabel(initialLeaderboard.view)),
    [category, setCategory] = useState(initialLeaderboard.category),
    [chain, setChain] = useState(initialLeaderboard.chain),
    [search, setSearch] = useState(initialLeaderboard.search);
  const [sort, setSort] = useState<{ key: CoinSortKey; dir: 1 | -1 }>({
      key: initialLeaderboard.sort.key,
      dir: initialLeaderboard.sort.direction === 'asc' ? 1 : -1,
    }),
    [voted, setVoted] = useState<number[]>(() =>
      uniqueCoinIds(initialInteractiveCoins.filter((coin) => coin.hasVoted)),
    ),
    [animating, setAnimating] = useState<number | null>(null),
    [watchlist, setWatchlist] = useState<number[]>(() =>
      uniqueCoinIds(initialInteractiveCoins.filter((coin) => coin.isWatching)),
    ),
    [watchAnimating, setWatchAnimating] = useState<number | null>(null),
    [interactionNotice, setInteractionNotice] = useState(''),
    [authOpen, setAuthOpen] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);
  const chainMenuRef = useRef<HTMLDivElement>(null);
  const hotspotTouchStartRef = useRef<number | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [categoryEdges, setCategoryEdges] = useState({ left: false, right: true });
  const [chainMenuOpen, setChainMenuOpen] = useState(false);
  const selectedChainChoice = coinChainChoices.find((choice) => choice.label === chain);
  const router = useRouter();
  const [isLeaderboardPending, startLeaderboardTransition] = useTransition();
  const [hotspotsVisible, setHotspotsVisible] = useState(true),
    [hotspotIndex, setHotspotIndex] = useState(0);
  useEffect(() => {
    function closeChainMenu(event: PointerEvent) {
      if (!chainMenuRef.current?.contains(event.target as Node)) setChainMenuOpen(false);
    }
    document.addEventListener('pointerdown', closeChainMenu);
    return () => document.removeEventListener('pointerdown', closeChainMenu);
  }, []);
  useEffect(() => {
    const el = categoryRef.current;
    if (!el) return;
    const update = () =>
      setCategoryEdges({
        left: el.scrollLeft > 2,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      });
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  useEffect(() => {
    if (!hotspotsVisible) return;
    const timer = window.setInterval(() => setHotspotIndex((i) => (i + 1) % 4), 4200);
    return () => window.clearInterval(timer);
  }, [hotspotsVisible]);
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    };
  }, []);
  const rows = leaderboardPage.rows;
  const pages = leaderboardPage.pages;
  const totalRows = leaderboardPage.total;
  const page = leaderboardPage.page;
  const visiblePageItems = getPaginationItems({ count: pages, page });
  const goToLeaderboard = ({
    nextView = view,
    nextCategory = category,
    nextChain = chain,
    nextSearch = search,
    nextSort = sort,
    nextPage = page,
  }: {
    nextView?: LeaderboardLabel;
    nextCategory?: string;
    nextChain?: string;
    nextSearch?: string;
    nextSort?: { key: CoinSortKey; dir: 1 | -1 };
    nextPage?: number;
  }) => {
    setView(nextView);
    setCategory(nextCategory);
    setChain(nextChain);
    setSearch(nextSearch);
    setSort(nextSort);

    const params = new URLSearchParams();
    if (nextView !== 'Top coins') params.set('coins', viewParams[nextView]);
    if (nextSort.key !== 'votes' || nextSort.dir !== -1) {
      params.set('sort', nextSort.key);
      params.set('dir', nextSort.dir === -1 ? 'desc' : 'asc');
    }
    if (nextCategory !== 'All') params.set('category', nextCategory);
    if (nextChain !== 'All chains') params.set('chain', nextChain);
    if (nextSearch) params.set('q', nextSearch);
    if (nextPage > 1) params.set('page', String(nextPage));

    const query = params.toString();
    startLeaderboardTransition(() => {
      router.push(`${window.location.pathname}${query ? `?${query}` : ''}#leaderboard`, {
        scroll: false,
      });
    });
  };
  const sortBy = (key: CoinSortKey) => {
    const nextSort = {
      key,
      dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : key === 'rank' ? 1 : -1,
    } satisfies { key: CoinSortKey; dir: 1 | -1 };
    goToLeaderboard({ nextSort, nextPage: 1 });
  };
  const searchLeaderboard = (value: string) => {
    setSearch(value);
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      goToLeaderboard({ nextSearch: value, nextPage: 1 });
    }, 350);
  };
  const updateCoinRows = (updater: (coin: CoinListItem) => CoinListItem) => {
    setHotspotCoins((current) => ({
      recent: current.recent.map(updater),
      trending: current.trending.map(updater),
      presales: current.presales.map(updater),
      watched: current.watched.map(updater),
    }));
    setPromotedCoins((coins) => coins.map(updater));
    setLeaderboardPage((current) => ({
      ...current,
      rows: current.rows.map(updater),
    }));
  };
  const vote = async (coinId: number) => {
    if (voted.includes(coinId)) return;
    if (!isSignedIn) {
      setAuthOpen(true);
      return;
    }
    setInteractionNotice('');
    setVoted((current) => [...current, coinId]);
    updateCoinRows((coin) =>
      coin.coinId === coinId
        ? {
            ...coin,
            hasVoted: true,
            rawVotes: coin.rawVotes + 1,
            votes: coin.votes + getBoostVoteFactor(coin.boost),
            totalVotes: coin.totalVotes + 1,
            recentVotes: coin.recentVotes + 1,
            trendingScore: coin.trendingScore + 3,
            trend: coin.trend + 3,
          }
        : coin,
    );
    setAnimating(coinId);
    window.setTimeout(() => setAnimating(null), 700);

    const response = await fetch(`/api/coins/${coinId}/vote`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setVoted((current) => current.filter((id) => id !== coinId));
      updateCoinRows((coin) =>
        coin.coinId === coinId
          ? {
              ...coin,
              hasVoted: false,
              rawVotes: Math.max(0, coin.rawVotes - 1),
              votes: Math.max(0, coin.votes - getBoostVoteFactor(coin.boost)),
              totalVotes: Math.max(0, coin.totalVotes - 1),
              recentVotes: Math.max(0, coin.recentVotes - 1),
              trendingScore: Math.max(0, coin.trendingScore - 3),
              trend: Math.max(0, coin.trend - 3),
            }
          : coin,
      );
      if (body.code === 'VOTE_COOLDOWN') {
        const summary = body.data?.summary;
        if (summary) updateCoinInteractionSummary(coinId, summary);
        return;
      }
      if (!showRateLimitToast(body, 'vote')) {
        setInteractionNotice(body.message || 'Could not record your vote.');
      }
      return;
    }

    const summary = body.data?.summary;
    if (summary) updateCoinInteractionSummary(coinId, summary);
  };
  const watch = async (coinId: number) => {
    if (!isSignedIn) {
      setAuthOpen(true);
      return;
    }
    const removing = watchlist.includes(coinId);
    setInteractionNotice('');
    setWatchlist((current) =>
      removing ? current.filter((id) => id !== coinId) : [...current, coinId],
    );
    updateCoinRows((coin) =>
      coin.coinId === coinId
        ? {
            ...coin,
            isWatching: !removing,
            watchCount: Math.max(0, coin.watchCount + (removing ? -1 : 1)),
            recentWatchlistAdds: Math.max(0, coin.recentWatchlistAdds + (removing ? -1 : 1)),
            trendingScore: Math.max(0, coin.trendingScore + (removing ? -2 : 2)),
            trend: Math.max(0, coin.trend + (removing ? -2 : 2)),
          }
        : coin,
    );
    if (removing) setWatchAnimating(null);
    else {
      setWatchAnimating(coinId);
      window.setTimeout(() => setWatchAnimating(null), 600);
    }

    const response = await fetch(`/api/coins/${coinId}/watchlist`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setWatchlist((current) =>
        removing ? [...current, coinId] : current.filter((id) => id !== coinId),
      );
      updateCoinRows((coin) =>
        coin.coinId === coinId
          ? {
              ...coin,
              isWatching: removing,
              watchCount: Math.max(0, coin.watchCount + (removing ? 1 : -1)),
              recentWatchlistAdds: Math.max(0, coin.recentWatchlistAdds + (removing ? 1 : -1)),
              trendingScore: Math.max(0, coin.trendingScore + (removing ? 2 : -2)),
              trend: Math.max(0, coin.trend + (removing ? 2 : -2)),
            }
          : coin,
      );
      if (!showRateLimitToast(body, 'watchlist')) {
        setInteractionNotice(body.message || 'Could not update your watchlist.');
      }
      return;
    }

    const summary = body.data?.summary;
    if (summary) updateCoinInteractionSummary(coinId, summary);
  };

  function updateCoinInteractionSummary(
    coinId: number,
    summary: {
      weeklyVotes?: number;
      totalVotes?: number;
      recentVotes?: number;
      recentWatchlistAdds?: number;
      trendingScore?: number;
      watchlistCount?: number;
      userHasVoted?: boolean;
      userWatching?: boolean;
    },
  ) {
    updateCoinRows((coin) =>
      coin.coinId === coinId
        ? (() => {
            const rawVotes = summary.weeklyVotes ?? coin.rawVotes;
            const boostedVotes = rawVotes * getBoostVoteFactor(coin.boost);
            return {
              ...coin,
              rawVotes,
              votes: boostedVotes,
              totalVotes: summary.totalVotes ?? coin.totalVotes,
              recentVotes: summary.recentVotes ?? coin.recentVotes,
              recentWatchlistAdds: summary.recentWatchlistAdds ?? coin.recentWatchlistAdds,
              trendingScore: summary.trendingScore ?? coin.trendingScore,
              trend: summary.trendingScore ?? coin.trend,
              watchCount: summary.watchlistCount ?? coin.watchCount,
              hasVoted: summary.userHasVoted ?? coin.hasVoted,
              isWatching: summary.userWatching ?? coin.isWatching,
            };
          })()
        : coin,
    );
    if (summary.userHasVoted === true)
      setVoted((current) => (current.includes(coinId) ? current : [...current, coinId]));
    if (summary.userHasVoted === false)
      setVoted((current) => current.filter((id) => id !== coinId));
    setWatchlist((current) => {
      if (summary.userWatching === true)
        return current.includes(coinId) ? current : [...current, coinId];
      if (summary.userWatching === false) return current.filter((id) => id !== coinId);
      return current;
    });
  }

  const handleHotspotSwipe = (x: number) => {
    const start = hotspotTouchStartRef.current;
    hotspotTouchStartRef.current = null;
    if (start === null) return;
    const delta = start - x;
    if (Math.abs(delta) < 42) return;
    setHotspotIndex((i) => (delta > 0 ? i + 1 : i + 3) % 4);
  };
  return (
    <main className="market-page">
      <BasicAdBannerPair ads={bannerAds.basic} />
      <section className="container hotspots-shell">
        <div className="hotspots-bar">
          <div>
            <b>Discovery hotspots</b>
            <span>Live discovery signals</span>
          </div>
          <button
            className={`hotspots-toggle ${hotspotsVisible ? 'on' : ''}`}
            onClick={() => setHotspotsVisible((v) => !v)}
            aria-pressed={hotspotsVisible}
          >
            <span />
            <b>{hotspotsVisible ? 'Shown' : 'Hidden'}</b>
          </button>
        </div>
        {hotspotsVisible && (
          <div
            className="hotspots-viewport"
            onPointerDown={(event) => {
              hotspotTouchStartRef.current = event.clientX;
            }}
            onPointerUp={(event) => {
              handleHotspotSwipe(event.clientX);
            }}
            onPointerCancel={() => {
              hotspotTouchStartRef.current = null;
            }}
          >
            <div
              className="discovery-grid"
              style={{ '--hotspot-slide': hotspotIndex } as CSSProperties}
            >
              <Discovery
                icon="new"
                title="Launched recently"
                sub="Newest coins in the market."
                coins={hotspotCoins.recent}
                viewMoreHref="/?coins=recent#leaderboard"
                metric="launch"
              />
              <Discovery
                icon="trend"
                title="Trending coins"
                sub="Getting attention today."
                coins={hotspotCoins.trending}
                viewMoreHref="/?coins=trending#leaderboard"
                metric="trend"
              />
              <Discovery
                icon="presale"
                title="Presale coins"
                sub="Ending soon, moving fast."
                coins={hotspotCoins.presales}
                viewMoreHref="/?coins=presales#leaderboard"
                metric="presaleEnd"
              />
              <Discovery
                icon="watch"
                title="Most watched"
                sub="Most saved by investors."
                coins={hotspotCoins.watched}
                viewMoreHref="/?coins=watched#leaderboard"
                metric="watchlist"
              />
            </div>
            <div className="hotspot-controls">
              <div className="hotspot-dots">
                {[0, 1, 2, 3].map((i) => (
                  <button
                    key={i}
                    className={hotspotIndex === i ? 'active' : ''}
                    onClick={() => setHotspotIndex(i)}
                    aria-label={`Show hotspot ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
      {interactionNotice && (
        <div className="container interaction-notice" role="status">
          {interactionNotice}
        </div>
      )}
      <section className="container promoted-section" id="promoted">
        <Title
          kicker="SPONSORED PLACEMENTS"
          title="Promoted coins"
          subtitle="Sponsored coins with active visibility packages. Promotion does not guarantee rank or endorsement."
        />
        <SimpleTable
          className="promoted-table"
          coins={rankCoins([...promotedCoins].sort(sortByVotes))}
          watchlist={watchlist}
          watchAnimating={watchAnimating}
          voted={voted}
          animating={animating}
          watch={watch}
          vote={vote}
          coinLinks={false}
        />
      </section>
      <PremiumAdBanner ads={bannerAds.premium} />
      <section className="container leaderboard" id="leaderboard">
        <div className="section-title">
          <div>
            <small>LIVE RANKINGS</small>
            <h1>Community leaderboard</h1>
            <p className="section-subtitle">
              Ranked by this week&apos;s verified community votes. Rankings reset every Monday at
              00:00 UTC.
            </p>
          </div>
          <WeeklyResetChip />
        </div>
        <div className="leader-tabs">
          {(
            [
              'Top coins',
              'Trending coins',
              'Presale coins',
              'Most watched',
              'Launched recently',
            ] as LeaderboardLabel[]
          ).map((x) => (
            <button
              key={x}
              className={view === x ? 'selected' : ''}
              onClick={() => {
                goToLeaderboard({ nextView: x, nextSort: defaultSort, nextPage: 1 });
              }}
            >
              {x}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <label className="search-box">
            <Search aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => searchLeaderboard(e.target.value)}
              placeholder="Search coin, symbol or chain"
            />
          </label>
          <div className="styled-select chain-select" ref={chainMenuRef}>
            <span>Chain</span>
            <button
              aria-expanded={chainMenuOpen}
              aria-haspopup="listbox"
              className="chain-select-trigger"
              type="button"
              onClick={() => setChainMenuOpen((open) => !open)}
            >
              {selectedChainChoice?.iconUrl && (
                <img
                  alt=""
                  aria-hidden="true"
                  height={17}
                  src={selectedChainChoice.iconUrl}
                  width={17}
                />
              )}
              <b>{chain}</b>
              <ChevronDown aria-hidden="true" />
            </button>
            {chainMenuOpen && (
              <div className="chain-select-menu" role="listbox" aria-label="Filter by chain">
                {coinChainChoices.map((choice) => (
                  <button
                    aria-selected={chain === choice.label}
                    className={chain === choice.label ? 'selected' : ''}
                    key={choice.label}
                    role="option"
                    type="button"
                    onClick={() => {
                      goToLeaderboard({ nextChain: choice.label, nextPage: 1 });
                      setChainMenuOpen(false);
                    }}
                  >
                    {choice.iconUrl ? (
                      <img alt="" aria-hidden="true" height={17} src={choice.iconUrl} width={17} />
                    ) : (
                      <span>◎</span>
                    )}
                    <b>{choice.label}</b>
                    {chain === choice.label && <Check aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="category-strip">
            <div className="category-scroll" ref={categoryRef}>
              {coinCategories.map((x) => (
                <button
                  key={x}
                  className={category === x ? 'selected' : ''}
                  onClick={() => {
                    goToLeaderboard({ nextCategory: x, nextPage: 1 });
                  }}
                >
                  {x}
                </button>
              ))}
            </div>
            {categoryEdges.left && (
              <button
                className="category-scroll-hint category-scroll-left"
                type="button"
                onClick={() => categoryRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
                aria-label="Scroll categories left"
              >
                <ChevronLeft aria-hidden="true" />
              </button>
            )}
            {categoryEdges.right && (
              <button
                className="category-scroll-hint category-scroll-right"
                type="button"
                onClick={() => categoryRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
                aria-label="Scroll categories right"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <TableScroller className={isLeaderboardPending ? 'table-scroller--pending' : ''}>
          <table className="coins-table">
            <thead>
              <tr>
                <SH l="#" k="rank" s={sort} go={sortBy} />
                <SH l="Coin" k="name" s={sort} go={sortBy} />
                <SH l="Market cap" k="capN" s={sort} go={sortBy} />
                <SH l="Price" k="price" s={sort} go={sortBy} />
                <SH l="24h" k="change" s={sort} go={sortBy} />
                <SH l="Launch" k="launch" s={sort} go={sortBy} />
                <SH l="Boost" k="boost" s={sort} go={sortBy} />
                <SH l="Weekly votes" k="votes" s={sort} go={sortBy} />
                <SH l="Submitted" k="age" s={sort} go={sortBy} />
                <th>Watch</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const has = voted.includes(c.coinId);
                return (
                  <tr
                    key={c.coinId}
                    className={`${c.boost ? 'boosted-row' : ''} clickable-coin-row`}
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest('a, button')) return;
                      router.push(`/coin/${c.coinId}`);
                    }}
                  >
                    <Cells coin={c} />
                    <td>
                      <Watch
                        active={watchlist.includes(c.coinId)}
                        bursting={watchAnimating === c.coinId}
                        onClick={() => watch(c.coinId)}
                      />
                    </td>
                    <td>
                      <button
                        className={`vote-btn ${has ? 'voted' : ''} ${animating === c.coinId ? 'just-voted' : ''}`}
                        onClick={() => vote(c.coinId)}
                      >
                        <LineBurst />
                        <span className="vote-label">
                          {has ? (
                            <>
                              Voted <Check aria-hidden="true" />
                            </>
                          ) : (
                            'Vote +1'
                          )}
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroller>
        <div className="pagination">
          <span>
            Showing {totalRows ? (page - 1) * leaderboardPage.pageSize + 1 : 0}–
            {Math.min(page * leaderboardPage.pageSize, totalRows)} of {totalRows}
          </span>
          <div>
            <button
              disabled={isLeaderboardPending || page === 1}
              onClick={() => goToLeaderboard({ nextPage: Math.max(1, page - 1) })}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            {visiblePageItems.map((item) =>
              typeof item === 'number' ? (
                <button
                  key={item}
                  className={page === item ? 'active' : ''}
                  disabled={isLeaderboardPending}
                  onClick={() => goToLeaderboard({ nextPage: item })}
                >
                  {item}
                </button>
              ) : (
                <span className="pagination-ellipsis" key={item} aria-hidden="true">
                  ...
                </span>
              ),
            )}
            <button
              disabled={isLeaderboardPending || page === pages}
              onClick={() => goToLeaderboard({ nextPage: Math.min(pages, page + 1) })}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
      <BasicAdBannerPair ads={bannerAds.basic} offset={2} />
      <DiscoveryGuide />
      <MailingListSignup />
      <SiteFooter id="footer" variant="home" />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </main>
  );
}

function sortByVotes(a: CoinListItem, b: CoinListItem) {
  return b.votes - a.votes || a.name.localeCompare(b.name);
}

function rankCoins(coins: CoinListItem[]) {
  return coins.map((coin, index) => ({ ...coin, rank: index + 1 }));
}

function uniqueCoinIds(coins: CoinListItem[]) {
  return Array.from(new Set(coins.map((coin) => coin.coinId)));
}

function serverViewToLabel(view: ServerLeaderboardView): LeaderboardLabel {
  if (view === 'trending') return 'Trending coins';
  if (view === 'presales') return 'Presale coins';
  if (view === 'watched') return 'Most watched';
  if (view === 'recent') return 'Launched recently';
  return 'Top coins';
}
