'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout/site-footer';
import { PremiumAdBanner } from '@/features/ads/components/ad-banners';
import type { PublicBannerAd } from '@/features/ads/types';
import { AuthModal } from '@/features/auth/components/lazy-auth-modal';
import { CoinTable } from '@/features/coins/components';
import type { Coin } from '@/features/coins/types';
import { getBoostVoteFactor, toCoinListItem, type CoinListItem } from '@/features/coins/view';
import { showRateLimitToast } from '@/lib/api/rate-limit-toast';
import { ChangeRequestModal } from './change-request-modal';
import { CoinChartCard } from './coin-chart-card';
import { CoinHero } from './coin-hero';
import { CoinInfoSections } from './coin-info-sections';
import { CoinSidebar } from './coin-sidebar';

export function CoinDetailPage({
  coinRecord,
  promotedCoins,
  premiumBannerAds,
  isSignedIn,
}: {
  coinRecord: Coin;
  promotedCoins: CoinListItem[];
  premiumBannerAds: PublicBannerAd[];
  isSignedIn: boolean;
}) {
  const canonicalCoin = coinRecord;
  const [coin, setCoin] = useState(() => toCoinListItem(canonicalCoin, 0));
  const [promotedRows, setPromotedRows] = useState(promotedCoins);
  const [promotedVoted, setPromotedVoted] = useState<number[]>(() =>
    promotedCoins.filter((item) => item.hasVoted).map((item) => item.coinId),
  );
  const [promotedWatched, setPromotedWatched] = useState<number[]>(() =>
    promotedCoins.filter((item) => item.isWatching).map((item) => item.coinId),
  );
  const [promotedVoteAnimating, setPromotedVoteAnimating] = useState<number | null>(null);
  const [promotedWatchAnimating, setPromotedWatchAnimating] = useState<number | null>(null);
  const contractAddress = coin.contractAddress || 'Contract address unavailable';
  const isSuspended = canonicalCoin.listingStatus !== 'active';
  const [voted, setVoted] = useState(coin.hasVoted);
  const [watched, setWatched] = useState(coin.isWatching);
  const [nextVoteAt, setNextVoteAt] = useState<string | null>(coin.nextVoteAt);
  const [notice, setNotice] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [contractCopied, setContractCopied] = useState(false);
  const [changeRequestOpen, setChangeRequestOpen] = useState(false);
  const [changeRequestIntent, setChangeRequestIntent] = useState<'change' | 'report'>('change');

  useEffect(() => {
    if (!voted || !nextVoteAt) return;
    const remainingMs = new Date(nextVoteAt).getTime() - Date.now();
    if (!Number.isFinite(remainingMs)) return;
    const timer = window.setTimeout(
      () => {
        setVoted(false);
        setNextVoteAt(null);
        setCoin((current) => ({ ...current, hasVoted: false, nextVoteAt: null }));
      },
      Math.max(0, remainingMs),
    );
    return () => window.clearTimeout(timer);
  }, [nextVoteAt, voted]);

  async function vote() {
    if (voted) return;
    if (isSuspended) {
      setNotice('Voting is paused while this coin is suspended.');
      return;
    }
    if (!isSignedIn) {
      setAuthOpen(true);
      return;
    }
    setNotice('');
    setVoted(true);
    setCoin((current) => ({
      ...current,
      hasVoted: true,
      rawVotes: current.rawVotes + 1,
      votes: current.votes + getBoostVoteFactor(current.boost),
      recentVotes: current.recentVotes + 1,
      trendingScore: current.trendingScore + 3,
      trend: current.trend + 3,
    }));
    const response = await fetch(`/api/coins/${coin.coinId}/vote`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (body.code === 'VOTE_COOLDOWN') {
        if (body.data?.nextVoteAt) setNextVoteAt(body.data.nextVoteAt);
        updateInteractionSummary(body.data?.summary);
        return;
      }
      if (body.data?.nextVoteAt) setNextVoteAt(body.data.nextVoteAt);
      setVoted(false);
      setCoin((current) => ({
        ...current,
        hasVoted: false,
        rawVotes: Math.max(0, current.rawVotes - 1),
        votes: Math.max(0, current.votes - getBoostVoteFactor(current.boost)),
        recentVotes: Math.max(0, current.recentVotes - 1),
        trendingScore: Math.max(0, current.trendingScore - 3),
        trend: Math.max(0, current.trend - 3),
      }));
      if (!showRateLimitToast(body)) {
        setNotice(body.message || 'Could not record your vote.');
      }
      return;
    }

    if (body.data?.nextVoteAt) setNextVoteAt(body.data.nextVoteAt);
    updateInteractionSummary(body.data?.summary);
  }

  async function toggleWatch() {
    if (isSuspended) {
      setNotice('Watchlist actions are paused while this coin is suspended.');
      return;
    }
    if (!isSignedIn) {
      setAuthOpen(true);
      return;
    }
    const adding = !watched;
    setNotice('');
    setWatched(adding);
    setCoin((current) => ({
      ...current,
      isWatching: adding,
      watchCount: Math.max(0, current.watchCount + (adding ? 1 : -1)),
      recentWatchlistAdds: Math.max(0, current.recentWatchlistAdds + (adding ? 1 : -1)),
      trendingScore: Math.max(0, current.trendingScore + (adding ? 2 : -2)),
      trend: Math.max(0, current.trend + (adding ? 2 : -2)),
    }));
    const response = await fetch(`/api/coins/${coin.coinId}/watchlist`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setWatched(!adding);
      setCoin((current) => ({
        ...current,
        isWatching: !adding,
        watchCount: Math.max(0, current.watchCount + (adding ? -1 : 1)),
        recentWatchlistAdds: Math.max(0, current.recentWatchlistAdds + (adding ? -1 : 1)),
        trendingScore: Math.max(0, current.trendingScore + (adding ? -2 : 2)),
        trend: Math.max(0, current.trend + (adding ? -2 : 2)),
      }));
      if (!showRateLimitToast(body)) {
        setNotice(body.message || 'Could not update your watchlist.');
      }
      return;
    }

    updateInteractionSummary(body.data?.summary);
  }

  async function votePromoted(coinId: number) {
    if (promotedVoted.includes(coinId)) return;
    if (!isSignedIn) {
      setAuthOpen(true);
      return;
    }
    setNotice('');
    setPromotedVoted((current) => [...current, coinId]);
    setPromotedRows((rows) =>
      rows.map((row) =>
        row.coinId === coinId
          ? {
              ...row,
              hasVoted: true,
              rawVotes: row.rawVotes + 1,
              votes: row.votes + getBoostVoteFactor(row.boost),
              totalVotes: row.totalVotes + 1,
              recentVotes: row.recentVotes + 1,
              trendingScore: row.trendingScore + 3,
              trend: row.trend + 3,
            }
          : row,
      ),
    );
    setPromotedVoteAnimating(coinId);
    window.setTimeout(() => setPromotedVoteAnimating(null), 700);

    const response = await fetch(`/api/coins/${coinId}/vote`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setPromotedVoted((current) => current.filter((id) => id !== coinId));
      setPromotedRows((rows) =>
        rows.map((row) =>
          row.coinId === coinId
            ? {
                ...row,
                hasVoted: false,
                rawVotes: Math.max(0, row.rawVotes - 1),
                votes: Math.max(0, row.votes - getBoostVoteFactor(row.boost)),
                totalVotes: Math.max(0, row.totalVotes - 1),
                recentVotes: Math.max(0, row.recentVotes - 1),
                trendingScore: Math.max(0, row.trendingScore - 3),
                trend: Math.max(0, row.trend - 3),
              }
            : row,
        ),
      );
      if (body.code === 'VOTE_COOLDOWN') {
        updatePromotedInteractionSummary(coinId, body.data?.summary);
        return;
      }
      if (!showRateLimitToast(body)) {
        setNotice(body.message || body.errorMessage || 'Could not record your vote.');
      }
      return;
    }

    updatePromotedInteractionSummary(coinId, body.data?.summary);
  }

  async function togglePromotedWatch(coinId: number) {
    if (!isSignedIn) {
      setAuthOpen(true);
      return;
    }
    const removing = promotedWatched.includes(coinId);
    setNotice('');
    setPromotedWatched((current) =>
      removing ? current.filter((id) => id !== coinId) : [...current, coinId],
    );
    setPromotedRows((rows) =>
      rows.map((row) =>
        row.coinId === coinId
          ? {
              ...row,
              isWatching: !removing,
              watchCount: Math.max(0, row.watchCount + (removing ? -1 : 1)),
              recentWatchlistAdds: Math.max(0, row.recentWatchlistAdds + (removing ? -1 : 1)),
              trendingScore: Math.max(0, row.trendingScore + (removing ? -2 : 2)),
              trend: Math.max(0, row.trend + (removing ? -2 : 2)),
            }
          : row,
      ),
    );
    if (removing) setPromotedWatchAnimating(null);
    else {
      setPromotedWatchAnimating(coinId);
      window.setTimeout(() => setPromotedWatchAnimating(null), 600);
    }

    const response = await fetch(`/api/coins/${coinId}/watchlist`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setPromotedWatched((current) =>
        removing ? [...current, coinId] : current.filter((id) => id !== coinId),
      );
      setPromotedRows((rows) =>
        rows.map((row) =>
          row.coinId === coinId
            ? {
                ...row,
                isWatching: removing,
                watchCount: Math.max(0, row.watchCount + (removing ? 1 : -1)),
                recentWatchlistAdds: Math.max(0, row.recentWatchlistAdds + (removing ? 1 : -1)),
                trendingScore: Math.max(0, row.trendingScore + (removing ? 2 : -2)),
                trend: Math.max(0, row.trend + (removing ? 2 : -2)),
              }
            : row,
        ),
      );
      if (!showRateLimitToast(body)) {
        setNotice(body.message || body.errorMessage || 'Could not update your watchlist.');
      }
      return;
    }

    updatePromotedInteractionSummary(coinId, body.data?.summary);
  }

  function updateInteractionSummary(
    summary:
      | {
          weeklyVotes?: number;
          totalVotes?: number;
          recentVotes?: number;
          recentWatchlistAdds?: number;
          trendingScore?: number;
          watchlistCount?: number;
          userHasVoted?: boolean;
          nextVoteAt?: string | null;
          userWatching?: boolean;
        }
      | undefined,
  ) {
    if (!summary) return;
    setCoin((current) => {
      const rawVotes = summary.weeklyVotes ?? current.rawVotes;
      const boostedVotes = rawVotes * getBoostVoteFactor(current.boost);
      return {
        ...current,
        rawVotes,
        votes: boostedVotes,
        recentVotes: summary.recentVotes ?? current.recentVotes,
        recentWatchlistAdds: summary.recentWatchlistAdds ?? current.recentWatchlistAdds,
        trendingScore: summary.trendingScore ?? current.trendingScore,
        trend: summary.trendingScore ?? current.trend,
        watchCount: summary.watchlistCount ?? current.watchCount,
        hasVoted: summary.userHasVoted ?? current.hasVoted,
        nextVoteAt: summary.nextVoteAt ?? current.nextVoteAt,
        isWatching: summary.userWatching ?? current.isWatching,
      };
    });
    if (typeof summary.userHasVoted === 'boolean') setVoted(summary.userHasVoted);
    if ('nextVoteAt' in summary) setNextVoteAt(summary.nextVoteAt ?? null);
    if (typeof summary.userWatching === 'boolean') setWatched(summary.userWatching);
  }

  function updatePromotedInteractionSummary(
    coinId: number,
    summary:
      | {
          weeklyVotes?: number;
          totalVotes?: number;
          recentVotes?: number;
          recentWatchlistAdds?: number;
          trendingScore?: number;
          watchlistCount?: number;
          userHasVoted?: boolean;
          nextVoteAt?: string | null;
          userWatching?: boolean;
        }
      | undefined,
  ) {
    if (!summary) return;
    setPromotedRows((rows) =>
      rows.map((row) =>
        row.coinId === coinId
          ? (() => {
              const rawVotes = summary.weeklyVotes ?? row.rawVotes;
              return {
                ...row,
                rawVotes,
                votes: rawVotes * getBoostVoteFactor(row.boost),
                totalVotes: summary.totalVotes ?? row.totalVotes,
                recentVotes: summary.recentVotes ?? row.recentVotes,
                recentWatchlistAdds: summary.recentWatchlistAdds ?? row.recentWatchlistAdds,
                trendingScore: summary.trendingScore ?? row.trendingScore,
                trend: summary.trendingScore ?? row.trend,
                watchCount: summary.watchlistCount ?? row.watchCount,
                hasVoted: summary.userHasVoted ?? row.hasVoted,
                nextVoteAt: summary.nextVoteAt ?? row.nextVoteAt,
                isWatching: summary.userWatching ?? row.isWatching,
              };
            })()
          : row,
      ),
    );
    if (summary.userHasVoted === true) {
      setPromotedVoted((current) => (current.includes(coinId) ? current : [...current, coinId]));
    }
    if (summary.userHasVoted === false) {
      setPromotedVoted((current) => current.filter((id) => id !== coinId));
    }
    setPromotedWatched((current) => {
      if (summary.userWatching === true) {
        return current.includes(coinId) ? current : [...current, coinId];
      }
      if (summary.userWatching === false) return current.filter((id) => id !== coinId);
      return current;
    });
  }

  async function copyContract() {
    await navigator.clipboard.writeText(contractAddress);
    setContractCopied(true);
    window.setTimeout(() => setContractCopied(false), 1400);
  }

  async function shareCoin() {
    const url = window.location.href;
    const title = `${coin.name} on EndorseCoin`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice('Coin page link copied.');
    } catch {
      return;
    }
  }

  function openChangeRequest(intent: 'change' | 'report') {
    setChangeRequestIntent(intent);
    setChangeRequestOpen(true);
  }

  return (
    <main className="market-page coin-detail-page">
      <div className="container coin-breadcrumb">
        <Link href="/">Coins</Link>
        <span>/</span>
        <span>{coin.name}</span>
      </div>

      <CoinHero
        coin={coin}
        contractAddress={contractAddress}
        contractCopied={contractCopied}
        onCopyContract={copyContract}
        onShare={shareCoin}
        onReport={() => openChangeRequest('report')}
      />

      {isSuspended && (
        <div className="container coin-status-notice" role="status">
          <span aria-hidden="true">!</span>
          <div>
            <b>This coin is currently suspended.</b>
            <p>
              Voting and watchlist actions are disabled while the listing is under review or queued
              for removal.
            </p>
          </div>
        </div>
      )}

      {notice && (
        <div className="container interaction-notice" role="status">
          {notice}
        </div>
      )}

      <PremiumAdBanner ads={premiumBannerAds} />

      <div className="container coin-layout">
        <div className="coin-main-column">
          <CoinChartCard coin={coin} canonicalCoin={canonicalCoin} />
          <CoinInfoSections coin={coin} />
        </div>

        <CoinSidebar
          coin={coin}
          voted={voted}
          watched={watched}
          nextVoteAt={nextVoteAt}
          actionsDisabled={isSuspended}
          onVote={vote}
          onToggleWatch={toggleWatch}
          onOpenChangeRequest={() => openChangeRequest('change')}
        />
      </div>

      <section className="promoted-section coin-promoted-section">
        <CoinTable
          className="promoted-table"
          coins={promotedRows}
          watchlist={promotedWatched}
          watchAnimating={promotedWatchAnimating}
          voted={promotedVoted}
          animating={promotedVoteAnimating}
          watch={togglePromotedWatch}
          vote={votePromoted}
          coinLinks={false}
          emptyMessage="There is currently no projects available to display."
        />
      </section>

      <ChangeRequestModal
        coinId={coin.coinId}
        coinName={coin.name}
        defaultType={changeRequestIntent}
        open={changeRequestOpen}
        onClose={() => setChangeRequestOpen(false)}
      />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <SiteFooter />
    </main>
  );
}
