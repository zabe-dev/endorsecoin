'use client';

import { AuthModal } from '@/features/auth/components/lazy-auth-modal';
import { CoinTable } from '@/features/coins/components/coin-table';
import { getBoostVoteFactor, type CoinListItem } from '@/features/coins/view';
import { showRateLimitToast } from '@/lib/api/rate-limit-toast';
import { useState } from 'react';

export function PromotedCoinsTable({
  coins,
  isSignedIn,
  className = 'promoted-table',
}: {
  coins: CoinListItem[];
  isSignedIn: boolean;
  className?: string;
}) {
  const [rows, setRows] = useState(coins);
  const [voted, setVoted] = useState<number[]>(() =>
    coins.filter((item) => item.hasVoted).map((item) => item.coinId),
  );
  const [watched, setWatched] = useState<number[]>(() =>
    coins.filter((item) => item.isWatching).map((item) => item.coinId),
  );
  const [voteAnimating, setVoteAnimating] = useState<number | null>(null);
  const [watchAnimating, setWatchAnimating] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [authOpen, setAuthOpen] = useState(false);

  async function vote(coinId: number) {
    if (voted.includes(coinId)) return;
    if (!isSignedIn) {
      setAuthOpen(true);
      return;
    }

    setNotice('');
    setVoted((current) => [...current, coinId]);
    setRows((currentRows) =>
      currentRows.map((row) =>
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
    setVoteAnimating(coinId);
    window.setTimeout(() => setVoteAnimating(null), 700);

    const response = await fetch(`/api/coins/${coinId}/vote`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setVoted((current) => current.filter((id) => id !== coinId));
      setRows((currentRows) =>
        currentRows.map((row) =>
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
        updateInteractionSummary(coinId, body.data?.summary);
        return;
      }
      if (!showRateLimitToast(body)) {
        setNotice(body.message || body.errorMessage || 'Could not record your vote.');
      }
      return;
    }

    updateInteractionSummary(coinId, body.data?.summary);
  }

  async function toggleWatch(coinId: number) {
    if (!isSignedIn) {
      setAuthOpen(true);
      return;
    }

    const removing = watched.includes(coinId);
    setNotice('');
    setWatched((current) =>
      removing ? current.filter((id) => id !== coinId) : [...current, coinId],
    );
    setRows((currentRows) =>
      currentRows.map((row) =>
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

    if (removing) setWatchAnimating(null);
    else {
      setWatchAnimating(coinId);
      window.setTimeout(() => setWatchAnimating(null), 600);
    }

    const response = await fetch(`/api/coins/${coinId}/watchlist`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setWatched((current) =>
        removing ? [...current, coinId] : current.filter((id) => id !== coinId),
      );
      setRows((currentRows) =>
        currentRows.map((row) =>
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

    updateInteractionSummary(coinId, body.data?.summary);
  }

  function updateInteractionSummary(
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

    setRows((currentRows) =>
      currentRows.map((row) =>
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
      setVoted((current) => (current.includes(coinId) ? current : [...current, coinId]));
    }
    if (summary.userHasVoted === false) {
      setVoted((current) => current.filter((id) => id !== coinId));
    }
    setWatched((current) => {
      if (summary.userWatching === true)
        return current.includes(coinId) ? current : [...current, coinId];
      if (summary.userWatching === false) return current.filter((id) => id !== coinId);
      return current;
    });
  }

  if (rows.length === 0) return null;

  return (
    <>
      {notice && (
        <div className="interaction-notice" role="status">
          {notice}
        </div>
      )}
      <CoinTable
        className={className}
        coins={rows}
        watchlist={watched}
        watchAnimating={watchAnimating}
        voted={voted}
        animating={voteAnimating}
        watch={toggleWatch}
        vote={vote}
        coinLinks={false}
        emptyMessage="There is currently no projects available to display."
      />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
