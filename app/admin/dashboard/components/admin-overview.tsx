'use client';

import type { AdminSummary, AdminTab } from '../types';

export function AdminOverview({
  summary,
  onSelectTab,
}: {
  summary: AdminSummary;
  onSelectTab: (tab: AdminTab) => void;
}) {
  return (
    <section className="admin-overview">
      <div className="admin-overview-focus">
        <div>
          <span>Needs review</span>
          <strong>
            {summary.pendingSubmissions + summary.pendingAirdrops + summary.changeRequests}
          </strong>
          <small>Items waiting for an admin decision.</small>
        </div>
        <div className="admin-attention-grid">
          <OverviewQueueCard
            title="Projects"
            value={summary.pendingSubmissions}
            label="submissions"
            action="Review"
            onClick={() => onSelectTab('submissions')}
          />
          <OverviewQueueCard
            title="Airdrops"
            value={summary.pendingAirdrops}
            label="campaigns"
            action="Review"
            onClick={() => onSelectTab('airdrops')}
          />
          <OverviewQueueCard
            title="Reports"
            value={summary.changeRequests}
            label="requests"
            action="Open"
            onClick={() => onSelectTab('reports')}
          />
        </div>
      </div>

      <div className="admin-dashboard-grid" aria-label="Admin summary">
        <SummaryCard label="Users" value={summary.users} />
        <SummaryCard label="Listed coins" value={summary.coins} />
        <SummaryCard label="Active boosts" value={summary.activeBoosts} />
        <SummaryCard label="Promoted coins" value={summary.promotedCoins} />
        <SummaryCard label="Active banners" value={summary.activeBanners} />
        <SummaryCard label="Scheduled banners" value={summary.scheduledBanners} />
      </div>

      <div className="admin-overview-shortcuts">
        <button type="button" onClick={() => onSelectTab('promotions')}>
          <span>Promotion desk</span>
          <b>{summary.activeBoosts + summary.promotedCoins}</b>
          <small>coins with active visibility</small>
        </button>
        <button type="button" onClick={() => onSelectTab('banners')}>
          <span>Banner schedule</span>
          <b>{summary.activeBanners}</b>
          <small>active placements</small>
        </button>
        <button type="button" onClick={() => onSelectTab('coins')}>
          <span>Listings</span>
          <b>{summary.coins}</b>
          <small>approved coins</small>
        </button>
      </div>
    </section>
  );
}

function OverviewQueueCard({
  title,
  value,
  label,
  action,
  onClick,
}: {
  title: string;
  value: number;
  label: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="admin-queue-card" onClick={onClick}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{label}</small>
      <b>{action} →</b>
    </button>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
