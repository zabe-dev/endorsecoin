'use client';

import { VoteButton, WatchlistButton } from '@/components/ui/action-buttons';
import { TablePagination } from '@/components/ui/table-pagination';
import { AuthModal } from '@/features/auth/components/auth-modal';
import type { AccountTablePage } from '@/features/account/types';
import { CoinCells } from '@/features/coins/components/coin-table';
import { getBoostVoteFactor, type CoinListItem } from '@/features/coins/view';
import { showRateLimitToast } from '@/lib/api/rate-limit-toast';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  LoaderCircle,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

type InlineNotice = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

export type AccountSubmission = {
  id: string;
  coinId: number | null;
  status: string;
  baseStatus?: string;
  submissionType: string;
  createdAt: string;
  coinData: { name?: string; symbol?: string; chain?: string };
  coin?: CoinListItem | null;
  scheduledDeleteAt?: string;
};

export type PublicWatchedCoin = CoinListItem & {
  savedAt: string;
};

export function WatchlistPanel({
  userId,
  coins,
  isSignedIn,
  afterTable,
  pagination,
}: {
  userId: string;
  coins: PublicWatchedCoin[];
  isSignedIn: boolean;
  afterTable?: ReactNode;
  pagination?: AccountTablePage;
}) {
  const [copiedWatchlistUrl, setCopiedWatchlistUrl] = useState(false);
  const watchlistPath = `/watchlist/${userId}`;

  useEffect(() => {
    if (!copiedWatchlistUrl) return;
    const timeout = window.setTimeout(() => setCopiedWatchlistUrl(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [copiedWatchlistUrl]);

  async function copyWatchlistUrl() {
    try {
      const watchlistUrl = `${window.location.origin}${watchlistPath}`;
      await navigator.clipboard.writeText(watchlistUrl);
      setCopiedWatchlistUrl(true);
    } catch {
      setCopiedWatchlistUrl(false);
    }
  }

  return (
    <section className="container settings-shell account-shell public-watchlist-shell">
      <header className="account-heading">
        <p className="eyebrow">
          <span>●</span> User area
        </p>
        <h1>Watchlist</h1>
        <p>Add coins to your watchlist and watch their performance.</p>
      </header>

      <section className="settings-card submissions-card watchlist-page-card">
        <div className="watchlist-page-toolbar">
          <button type="button" onClick={() => void copyWatchlistUrl()}>
            {copiedWatchlistUrl ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            COPY PUBLIC LINK
          </button>
          <span>{coins.length}</span>
        </div>
        {coins.length ? (
          <PublicWatchlistTable coins={coins} isSignedIn={isSignedIn} />
        ) : (
          <div className="settings-empty">
            <strong>There is currently no projects available to display.</strong>
          </div>
        )}
        {pagination && <AccountPagination pagination={pagination} />}
      </section>
      {afterTable && <div className="account-table-ad account-table-ad-inline">{afterTable}</div>}
    </section>
  );
}

export function AccountPanel({
  submissions,
  afterTable,
  pagination,
}: {
  submissions: AccountSubmission[];
  afterTable?: ReactNode;
  pagination?: AccountTablePage;
}) {
  const [submissionNotice, setSubmissionNotice] = useState<InlineNotice | null>(null);
  const [deleteModal, setDeleteModal] = useState<AccountSubmission | null>(null);
  const [deletionOverrides, setDeletionOverrides] = useState<Record<string, string | null>>({});
  const listingRows = submissions.map((submission) => {
    if (!(submission.id in deletionOverrides)) return submission;
    const scheduledDeleteAt = deletionOverrides[submission.id];
    return scheduledDeleteAt
      ? { ...submission, status: 'suspended', scheduledDeleteAt }
      : {
          ...submission,
          status: submission.baseStatus || 'approved',
          scheduledDeleteAt: undefined,
        };
  });

  return (
    <section className="container settings-shell account-shell">
      <header className="account-heading">
        <p className="eyebrow">
          <span>●</span> User area
        </p>
        <h1>Dashboard</h1>
        <p>Manage your submitted projects.</p>
      </header>

      <section className="settings-card submissions-card watchlist-page-card">
        <div className="watchlist-page-toolbar">
          <span>{submissions.length}</span>
        </div>
        <InlineFeedback notice={submissionNotice} />
        {submissions.length ? (
          <SubmissionTable submissions={listingRows} onRequestDelete={setDeleteModal} />
        ) : (
          <div className="settings-empty">
            <strong>There is currently no projects available to display.</strong>
          </div>
        )}
        {pagination && <AccountPagination pagination={pagination} />}
      </section>
      {afterTable && <div className="account-table-ad account-table-ad-inline">{afterTable}</div>}
      {deleteModal && (
        <DeleteSubmissionModal
          submission={deleteModal}
          onClose={() => setDeleteModal(null)}
          onNotice={setSubmissionNotice}
          onScheduled={(scheduledDeleteAt) => {
            setDeletionOverrides((current) => ({
              ...current,
              [deleteModal.id]: scheduledDeleteAt,
            }));
            setDeleteModal((current) =>
              current ? { ...current, status: 'suspended', scheduledDeleteAt } : current,
            );
          }}
          onCancelled={() => {
            setDeletionOverrides((current) => ({ ...current, [deleteModal.id]: null }));
            setDeleteModal(null);
            setSubmissionNotice({
              tone: 'success',
              message: 'Deletion request cancelled. The coin is active again.',
            });
          }}
        />
      )}
    </section>
  );
}

function InlineFeedback({ notice }: { notice: InlineNotice | null }) {
  if (!notice) return null;

  const Icon = notice.tone === 'success' ? CheckCircle2 : AlertCircle;

  return (
    <p
      className={`inline-feedback ${notice.tone}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <Icon aria-hidden="true" />
      {notice.message}
    </p>
  );
}

export function PublicWatchlistTable({
  coins,
  isSignedIn = false,
}: {
  coins: PublicWatchedCoin[];
  isSignedIn?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(coins);
  const [voted, setVoted] = useState<number[]>(() =>
    coins.filter((coin) => coin.hasVoted).map((coin) => coin.coinId),
  );
  const [watchlist, setWatchlist] = useState<number[]>(() =>
    coins.filter((coin) => coin.isWatching).map((coin) => coin.coinId),
  );
  const [animating, setAnimating] = useState<number | null>(null);
  const [watchAnimating, setWatchAnimating] = useState<number | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [interactionNotice, setInteractionNotice] = useState<InlineNotice | null>(null);

  function openCoinRow(event: MouseEvent<HTMLTableRowElement>, coinId: number) {
    const target = event.target as HTMLElement;
    if (target.closest('a, button')) return;
    router.push(`/coin/${coinId}`);
  }

  async function vote(coinId: number) {
    if (voted.includes(coinId)) return;
    if (!isSignedIn) {
      setAuthOpen(true);
      return;
    }
    setInteractionNotice(null);
    setVoted((current) => [...current, coinId]);
    setRows((currentRows) =>
      currentRows.map((coin) =>
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
      ),
    );
    setAnimating(coinId);
    window.setTimeout(() => setAnimating(null), 700);

    const response = await fetch(`/api/coins/${coinId}/vote`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setVoted((current) => current.filter((id) => id !== coinId));
      setRows((currentRows) =>
        currentRows.map((coin) =>
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
        ),
      );
      if (body.code === 'VOTE_COOLDOWN') {
        updateCoinInteractionSummary(coinId, body.data?.summary);
        return;
      }
      if (!showRateLimitToast(body, 'vote')) {
        setInteractionNotice({
          tone: 'error',
          message: body.message || body.errorMessage || 'Could not record your vote.',
        });
      }
      return;
    }

    updateCoinInteractionSummary(coinId, body.data?.summary);
  }

  async function toggleWatch(coinId: number) {
    if (!isSignedIn) {
      setAuthOpen(true);
      return;
    }
    const removing = watchlist.includes(coinId);
    setInteractionNotice(null);
    setWatchlist((current) =>
      removing ? current.filter((id) => id !== coinId) : [...current, coinId],
    );
    setRows((currentRows) =>
      currentRows.map((coin) =>
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
      setWatchlist((current) =>
        removing ? [...current, coinId] : current.filter((id) => id !== coinId),
      );
      setRows((currentRows) =>
        currentRows.map((coin) =>
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
        ),
      );
      if (!showRateLimitToast(body, 'watchlist')) {
        setInteractionNotice({
          tone: 'error',
          message: body.message || body.errorMessage || 'Could not update your watchlist.',
        });
      }
      return;
    }

    updateCoinInteractionSummary(coinId, body.data?.summary);
  }

  function updateCoinInteractionSummary(
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
          userWatching?: boolean;
        }
      | undefined,
  ) {
    if (!summary) return;
    setRows((currentRows) =>
      currentRows.map((coin) =>
        coin.coinId === coinId
          ? (() => {
              const rawVotes = summary.weeklyVotes ?? coin.rawVotes;
              return {
                ...coin,
                rawVotes,
                votes: rawVotes * getBoostVoteFactor(coin.boost),
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
      ),
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

  return (
    <>
      <InlineFeedback notice={interactionNotice} />
      <div className="table-frame public-watchlist-frame">
        <div className="table-wrap public-watchlist-table-wrap">
          <table className="coins-table public-watchlist-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Coin</th>
                <th>Market cap</th>
                <th>Price</th>
                <th>24h</th>
                <th>Launch</th>
                <th>Boost</th>
                <th>Weekly votes</th>
                <th>Submitted</th>
                <th>Saved</th>
                <th>Watch</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((coin) => {
                const hasVoted = voted.includes(coin.coinId);
                return (
                  <tr
                    key={coin.coinId}
                    className={`${coin.boost ? 'boosted-row' : ''} clickable-coin-row`}
                    onClick={(event) => openCoinRow(event, coin.coinId)}
                  >
                    <CoinCells coin={coin} />
                    <td className="muted-cell">{new Date(coin.savedAt).toLocaleDateString()}</td>
                    <td>
                      <WatchlistButton
                        active={watchlist.includes(coin.coinId)}
                        animating={watchAnimating === coin.coinId}
                        onClick={() => toggleWatch(coin.coinId)}
                      />
                    </td>
                    <td>
                      <VoteButton
                        active={hasVoted}
                        animating={animating === coin.coinId}
                        onClick={() => vote(coin.coinId)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}

export function AccountPagination({ pagination }: { pagination: AccountTablePage }) {
  return <TablePagination pagination={pagination} />;
}

function SubmissionTable({
  submissions,
  onRequestDelete,
}: {
  submissions: AccountSubmission[];
  onRequestDelete: (submission: AccountSubmission) => void;
}) {
  const router = useRouter();

  function openCoinRow(event: MouseEvent<HTMLTableRowElement>, coinId: number | null) {
    if (!coinId) return;
    const target = event.target as HTMLElement;
    if (target.closest('a, button')) return;
    router.push(`/coin/${coinId}`);
  }

  return (
    <div className="table-frame public-watchlist-frame dashboard-submissions-frame">
      <div className="table-wrap public-watchlist-table-wrap">
        <table className="coins-table public-watchlist-table dashboard-submissions-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Coin</th>
              <th>Market cap</th>
              <th>Price</th>
              <th>24h</th>
              <th>Launch</th>
              <th>Boost</th>
              <th>Weekly votes</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((submission, index) => {
              const coin = submission.coin;
              const deleteRequested = Boolean(submission.scheduledDeleteAt);
              const name =
                coin?.name || submission.coinData.name || `Submission ${submission.id.slice(0, 8)}`;
              return (
                <tr
                  key={submission.id}
                  className={`${coin?.boost ? 'boosted-row' : ''} ${submission.coinId ? 'clickable-coin-row' : ''}`}
                  onClick={(event) => openCoinRow(event, submission.coinId)}
                >
                  {coin ? (
                    <CoinCells coin={coin} />
                  ) : (
                    <SubmissionFallbackCells submission={submission} rank={index + 1} />
                  )}
                  <td>
                    <span className={`submission-status status-${submission.status}`}>
                      {submission.status}
                    </span>
                  </td>
                  <td>
                    <div className="submission-actions table-actions">
                      <button
                        className="delete-request submission-icon-action"
                        type="button"
                        onClick={() => onRequestDelete(submission)}
                        aria-label={
                          deleteRequested
                            ? `View deletion countdown for ${name}`
                            : `Request deletion for ${name}`
                        }
                        title={
                          deleteRequested
                            ? `View deletion countdown for ${name}`
                            : `Request deletion for ${name}`
                        }
                      >
                        {deleteRequested ? (
                          <Clock3 aria-hidden="true" />
                        ) : (
                          <Trash2 aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SubmissionFallbackCells({
  submission,
  rank,
}: {
  submission: AccountSubmission;
  rank: number;
}) {
  const name = submission.coinData.name || `Submission ${submission.id.slice(0, 8)}`;
  const symbol = submission.coinData.symbol || '—';

  return (
    <>
      <td>
        <span className={`rank-number ${rank < 4 ? 'top' : ''}`}>{rank}</span>
      </td>
      <td>
        <div className="coin-cell">
          <div className="coin-logo">{symbol.slice(0, 1)}</div>
          <div>
            <span className="coin-name-static" title={name}>
              <b>{name}</b>
            </span>
            <span>
              {symbol} · {submission.coinData.chain || 'Chain not set'}
            </span>
          </div>
        </div>
      </td>
      <td className="numeric">—</td>
      <td className="numeric">—</td>
      <td className="muted-cell">—</td>
      <td className="muted-cell">—</td>
      <td>
        <span className="no-boost">—</span>
      </td>
      <td>
        <div className="vote-total">
          <b>—</b>
          <span>this week</span>
        </div>
      </td>
      <td className="muted-cell">{new Date(submission.createdAt).toLocaleDateString()}</td>
    </>
  );
}

function DeleteSubmissionModal({
  submission,
  onClose,
  onNotice,
  onScheduled,
  onCancelled,
}: {
  submission: AccountSubmission;
  onClose: () => void;
  onNotice: (notice: InlineNotice) => void;
  onScheduled: (scheduledDeleteAt: string) => void;
  onCancelled: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [modalNotice, setModalNotice] = useState<InlineNotice | null>(null);
  const scheduledDeleteAt = submission.scheduledDeleteAt || '';
  const countdown = useCountdown(scheduledDeleteAt);
  const name = submission.coinData.name || `Submission ${submission.id.slice(0, 8)}`;
  const alreadyScheduled = Boolean(scheduledDeleteAt);

  async function requestDelete() {
    setModalNotice({ tone: 'info', message: 'Scheduling deletion request…' });
    setDeleting(true);
    const response = await fetch(`/api/coin-submissions/${submission.id}/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete' }),
    });
    const body = await response.json().catch(() => ({}));
    setDeleting(false);

    if (response.ok) {
      const nextScheduledDeleteAt =
        body.data?.scheduledDeleteAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      onScheduled(nextScheduledDeleteAt);
      const notice = {
        tone: 'success' as const,
        message: 'Deletion request sent. The coin is suspended and will be deleted in 24 hours.',
      };
      setModalNotice(notice);
      onNotice(notice);
      return;
    }

    setModalNotice({
      tone: 'error',
      message: body.message || body.errorMessage || 'Could not send the deletion request.',
    });
  }

  async function cancelDelete() {
    setModalNotice({ tone: 'info', message: 'Cancelling deletion request…' });
    setCancelling(true);
    const response = await fetch(`/api/coin-submissions/${submission.id}/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'cancel-delete' }),
    });
    const body = await response.json().catch(() => ({}));
    setCancelling(false);

    if (response.ok) {
      onCancelled();
      return;
    }

    setModalNotice({
      tone: 'error',
      message: body.message || body.errorMessage || 'Could not cancel the deletion request.',
    });
  }

  return (
    <div className="account-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="account-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-submission-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="account-modal-close"
          type="button"
          onClick={onClose}
          aria-label="Close deletion request"
        >
          <X aria-hidden="true" />
        </button>
        <div className="account-modal-icon danger">
          <Trash2 aria-hidden="true" />
        </div>
        <h2 id="delete-submission-title">Delete this submitted coin?</h2>
        <p>
          {alreadyScheduled
            ? `${name} is already suspended and queued for permanent deletion.`
            : `${name} will be suspended right away, then permanently deleted after 24 hours.`}
        </p>
        <div className="account-countdown-card">
          <span>{alreadyScheduled ? 'Time before deletion' : 'Deletion window'}</span>
          <strong>{alreadyScheduled ? countdown : '24 hours'}</strong>
        </div>
        <InlineFeedback notice={modalNotice} />
        <div className="account-modal-actions">
          <button type="button" className="account-secondary-action" onClick={onClose}>
            Close
          </button>
          {!alreadyScheduled && (
            <button
              type="button"
              className="account-danger-action"
              onClick={() => void requestDelete()}
              disabled={deleting}
            >
              {deleting && <LoaderCircle className="account-action-spinner" aria-hidden="true" />}
              {deleting ? 'Scheduling…' : 'Suspend and delete'}
            </button>
          )}
          {alreadyScheduled && (
            <button
              type="button"
              className="account-restore-action"
              onClick={() => void cancelDelete()}
              disabled={cancelling}
            >
              {cancelling ? (
                <LoaderCircle className="account-action-spinner" aria-hidden="true" />
              ) : (
                <RotateCcw aria-hidden="true" />
              )}
              {cancelling ? 'Cancelling…' : 'Cancel deletion'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function useCountdown(deadline: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  if (!deadline) return '24 hours';
  const remaining = Math.max(0, new Date(deadline).getTime() - now);
  if (!remaining) return 'Deleting soon';

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}
