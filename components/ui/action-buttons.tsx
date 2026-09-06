'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Star } from 'lucide-react';

export function ActionBurst() {
  return (
    <span className="action-burst" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <i key={index} style={{ '--ray': `${index * 45}deg` } as CSSProperties} />
      ))}
    </span>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return <Star className="star-svg" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} />;
}

export function WatchlistButton({
  active,
  animating = false,
  disabled = false,
  onClick,
  appearance = 'table',
}: {
  active: boolean;
  animating?: boolean;
  disabled?: boolean;
  onClick: () => void;
  appearance?: 'table' | 'detail';
}) {
  const showsBurst = appearance === 'table';
  return (
    <button
      className={`${appearance === 'table' ? 'watch-btn' : 'detail-watch'} action-button action-button--watch ${active ? (appearance === 'table' ? 'watched' : 'active') : ''} ${showsBurst && animating ? 'just-watched' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={active ? 'Remove from watchlist' : 'Add to watchlist'}
    >
      {showsBurst && <ActionBurst />}
      <span>
        <StarIcon filled={active} />
        {appearance === 'detail' && (active ? 'Watching' : 'Watchlist')}
      </span>
    </button>
  );
}

export function VoteButton({
  active,
  animating = false,
  disabled = false,
  onClick,
  appearance = 'table',
  coinName,
  cooldownUntil,
}: {
  active: boolean;
  animating?: boolean;
  disabled?: boolean;
  onClick: () => void;
  appearance?: 'table' | 'sidebar';
  coinName?: string;
  cooldownUntil?: string | null;
}) {
  const baseClass = appearance === 'table' ? 'vote-btn' : 'sidebar-vote';
  const showsBurst = appearance === 'table';
  const countdownLabel = useVoteCountdown(cooldownUntil);
  const waitingDots = (
    <span className="vote-wait-dots" aria-label="Waiting for vote cooldown">
      <i />
      <i />
      <i />
    </span>
  );
  const label =
    appearance === 'sidebar'
      ? active
        ? countdownLabel || waitingDots
        : `Vote for ${coinName ?? 'coin'}`
      : active
        ? 'Voted'
        : 'Vote +1';
  const showCheck = active && appearance !== 'sidebar';

  return (
    <button
      className={`${baseClass} action-button action-button--vote ${active ? (appearance === 'table' ? 'voted' : 'active') : ''} ${showsBurst && animating ? 'just-voted' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {showsBurst && <ActionBurst />}
      <span className="action-button__label">
        {label}
        {showCheck && <Check aria-hidden="true" />}
      </span>
    </button>
  );
}

function useVoteCountdown(cooldownUntil?: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  if (!cooldownUntil) return '';
  const remainingMs = new Date(cooldownUntil).getTime() - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '';

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
