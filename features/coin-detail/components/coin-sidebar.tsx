'use client';

import { VoteButton, WatchlistButton } from '@/components/ui/action-buttons';
import { BoltIcon } from '@/features/coins/components';
import { ExternalLink, Pencil } from 'lucide-react';
import Link from 'next/link';
import type { CoinDetailView } from '../types';
import { Info } from './detail-card';

export function CoinSidebar({
  coin,
  voted,
  watched,
  nextVoteAt,
  actionsDisabled = false,
  onVote,
  onToggleWatch,
  onOpenChangeRequest,
}: {
  coin: CoinDetailView;
  voted: boolean;
  watched: boolean;
  nextVoteAt: string | null;
  actionsDisabled?: boolean;
  onVote: () => void;
  onToggleWatch: () => void;
  onOpenChangeRequest: () => void;
}) {
  return (
    <aside className="coin-sidebar">
      <section className="detail-card voting-card">
        <small>WEEK 35 RANKING</small>
        <div className="ranking-number">
          <span>#</span>
          {coin.rank}
        </div>
        <p>
          <b>{coin.votes.toLocaleString()}</b> community votes
        </p>
        <div className="vote-progress">
          <i style={{ width: coin.votes ? '20%' : '0%' }} />
        </div>
        <div className="vote-reset-inline">
          <span>Next reset</span>
          <b>04d : 12h</b>
        </div>
        <VoteButton
          active={voted}
          onClick={onVote}
          appearance="sidebar"
          coinName={coin.symbol}
          cooldownUntil={nextVoteAt}
          disabled={actionsDisabled}
        />
        <WatchlistButton
          active={watched}
          onClick={onToggleWatch}
          appearance="detail"
          disabled={actionsDisabled}
        />
        <small className="vote-rule">
          {actionsDisabled
            ? 'Voting and watchlist actions are paused for this coin.'
            : 'Vote for each coin once every 12 hours.'}
        </small>
      </section>
      {coin.boost ? (
        <section className="detail-card boost-card-detail">
          <div className="boost-card-icon" aria-hidden="true">
            <BoltIcon />
          </div>
          <div className="boost-card-copy">
            <small>ACTIVE BOOST</small>
            <h3>{coin.boost}× vote boost</h3>
            <p>Votes count higher while active.</p>
          </div>
        </section>
      ) : (
        <section className="detail-card boost-cta-card">
          <div className="boost-card-icon" aria-hidden="true">
            <BoltIcon />
          </div>
          <div>
            <small>BOOST VISIBILITY</small>
            <h3>Boost this coin</h3>
            <p>Make every vote count more.</p>
          </div>
          <Link href="/advertise">View boost packages ↗</Link>
        </section>
      )}
      <section className="detail-card quick-info">
        <h3>Coin information</h3>
        <Info label="Network" value={coin.chain} />
        <Info label="Category" value={coin.category} />
        {coin.lifecycle === 'presale' && (
          <>
            <InfoLink label="Presale website" url={coin.presale.websiteUrl} />
            <Info label="Presale coin" value={coin.presale.paymentToken || '—'} />
            <Info label="Soft cap" value={formatPresaleCap(coin.presale.softCap)} />
            <Info label="Hard cap" value={formatPresaleCap(coin.presale.hardCap)} />
            <Info label="Start date" value={formatPresaleDateTime(coin.presaleStartTimestamp)} />
            <Info label="End date" value={formatPresaleDateTime(coin.presaleEndTimestamp)} />
          </>
        )}
        <Info label="Submitted" value={coin.age} />
        <Info
          label="Status"
          value={
            coin.listingStatus === 'active'
              ? coin.lifecycle === 'presale'
                ? 'Presale'
                : 'Launched'
              : 'Suspended'
          }
        />
      </section>
      <section className="detail-card request-change-card">
        <div className="request-change-icon" aria-hidden="true">
          <Pencil />
        </div>
        <div>
          <h3>Something incorrect?</h3>
          <p>Request an update to this coin&apos;s information, links, or listing.</p>
        </div>
        <button onClick={onOpenChangeRequest}>Request a change</button>
      </section>
    </aside>
  );
}

function formatPresaleDateTime(value: string | null) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
    .format(new Date(value))
    .replace(/\//g, '-')
    .replace(',', '');
}

function formatPresaleCap(value: string | null) {
  return value?.trim() || '—';
}

function InfoLink({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="quick-info-link">
      <span>{label}</span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          Open <ExternalLink aria-hidden="true" />
        </a>
      ) : (
        <b>—</b>
      )}
    </div>
  );
}
