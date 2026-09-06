'use client';

import {
  addPromotedCoin,
  createBannerAd,
  deleteBannerAd,
  deleteAdminCoin,
  deleteAdminUser,
  grantCoinBoost,
  removeCoinBoost,
  removePromotedCoin,
  updateBannerAd,
  updateChangeRequestStatus,
  updateAdminCoin,
  updateAdminSubmission,
  updateAdminUser,
} from '@/app/admin/dashboard/actions';
import {
  bannerPlacementLabels,
  bannerPlacements,
  type BannerPlacement,
} from '@/features/ads/types';
import { getPaginationItems } from '@/lib/ui/pagination';
import { Icon as IconifyIcon } from '@iconify/react';
import {
  Check,
  Eye,
  ExternalLink,
  Image as ImageIcon,
  LayoutDashboard,
  Megaphone,
  Pause,
  Pencil,
  Play,
  ShieldAlert,
  Search,
  Square,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

export type AdminSummary = {
  users: number;
  coins: number;
  activeBoosts: number;
  promotedCoins: number;
  activeBanners: number;
  pendingSubmissions: number;
  changeRequests: number;
};

export type AdminSubmissionRow = {
  id: string;
  logoUrl: string | null;
  name: string;
  symbol: string;
  chain: string;
  submittedBy: string;
  contactEmail: string;
  contactTelegram: string;
  submittedAt: string;
  status: string;
  flag: string;
  details: AdminSubmissionDetailSection[];
  rawData: string;
};

export type AdminSubmissionDetailSection = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

export type AdminCoinRow = {
  id: number;
  logoUrl: string | null;
  name: string;
  symbol: string;
  chain: string;
  submittedBy: string;
  contactEmail: string;
  contactTelegram: string;
  submittedAt: string;
  status: string;
  category: string;
  boost: {
    tier: number;
    status: string;
    startDate: string;
    startsAt: string;
    expiresAt: string;
    remaining: string;
  } | null;
  promotion: {
    status: string;
    priority: number;
    startDate: string;
    startsAt: string;
    durationDays: number;
    expiresAt: string;
    remaining: string;
  } | null;
};

export type AdminBannerRow = {
  id: string;
  placement: string;
  placementLabel: string;
  title: string;
  subtitle: string;
  desktopImageUrl: string;
  mobileImageUrl: string;
  targetUrl: string;
  status: string;
  priority: number;
  startDate: string;
  startsAt: string;
  endsAt: string;
  durationDays: number;
  schedule: string;
  notes: string;
};

export type AdminChangeRequestRow = {
  id: string;
  coinId: number;
  coinName: string;
  coinSymbol: string;
  requesterEmail: string;
  requesterTelegram: string;
  requestedChanges: string;
  evidenceUrl: string;
  status: string;
  submittedAt: string;
};

export type AdminUserRow = {
  id: string;
  avatar: string;
  avatarTone: number;
  name: string;
  email: string;
  role: string;
  status: string;
  projectsSubmitted: number;
  joinedAt: string;
  lastActive: string;
  lastIp: string;
};

type AdminDashboardClientProps = {
  summary: AdminSummary;
  pendingSubmissions: AdminSubmissionRow[];
  changeRequests: AdminChangeRequestRow[];
  listedCoins: AdminCoinRow[];
  bannerAds: AdminBannerRow[];
  users: AdminUserRow[];
  initialTab?: string;
};

type PopoverController = {
  activePopoverId: string | null;
  setActivePopoverId: (id: string | null) => void;
};

const pageSize = 10;
const emptyTableMessage = 'There is currently no projects available to display.';
const boostPackages = [
  { value: 10, label: '10x', detail: 'votes ×2 · 24h' },
  { value: 30, label: '30x', detail: 'votes ×2 · 72h' },
  { value: 50, label: '50x', detail: 'votes ×3 · 24h' },
  { value: 100, label: '100x', detail: 'votes ×3 · 72h' },
  { value: 500, label: '500x', detail: 'votes ×5 · 168h' },
];

const adminTabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'submissions', label: 'Submissions', icon: Eye },
  { id: 'coins', label: 'Coins', icon: ExternalLink },
  { id: 'promotions', label: 'Promotions', icon: Megaphone },
  { id: 'banners', label: 'Banner ads', icon: ImageIcon },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'reports', label: 'Reports', icon: ShieldAlert },
] as const;

type AdminTab = (typeof adminTabs)[number]['id'];

const tabCounts = (summary: AdminSummary) =>
  ({
    overview: 0,
    submissions: summary.pendingSubmissions,
    coins: summary.coins,
    promotions: summary.activeBoosts + summary.promotedCoins,
    banners: summary.activeBanners,
    users: summary.users,
    reports: summary.changeRequests,
  }) satisfies Record<AdminTab, number>;

export function AdminDashboardClient({
  summary,
  pendingSubmissions,
  changeRequests,
  listedCoins,
  bannerAds,
  users,
  initialTab,
}: AdminDashboardClientProps) {
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);
  const safeInitialTab: AdminTab = isAdminTab(initialTab || null)
    ? (initialTab as AdminTab)
    : 'overview';
  const [activeTab, setActiveTab] = useState<AdminTab>(safeInitialTab);
  const pathname = usePathname();
  const router = useRouter();
  const popover = { activePopoverId, setActivePopoverId };
  const counts = tabCounts(summary);
  const promotedRows = useMemo(
    () => listedCoins.filter((coin) => coin.boost || coin.promotion),
    [listedCoins],
  );

  function switchTab(nextTab: AdminTab) {
    setActivePopoverId(null);
    setActiveTab(nextTab);
    const params = new URLSearchParams(window.location.search);
    if (nextTab === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', nextTab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="admin-workspace">
      <div className="admin-tabs" role="tablist" aria-label="Admin sections">
        {adminTabs.map((tab) => {
          const Icon = tab.icon;
          const count = counts[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => switchTab(tab.id)}
            >
              <Icon aria-hidden="true" />
              <span>{tab.label}</span>
              {count > 0 && <b>{count}</b>}
            </button>
          );
        })}
      </div>

      <div className="admin-tab-panel" role="tabpanel">
        {activeTab === 'overview' && (
          <AdminOverview
            summary={summary}
            pendingSubmissions={pendingSubmissions}
            changeRequests={changeRequests}
            promotedRows={promotedRows}
            bannerAds={bannerAds}
            onSelectTab={switchTab}
          />
        )}
        {activeTab === 'submissions' && (
          <PendingSubmissionsTable rows={pendingSubmissions} popover={popover} />
        )}
        {activeTab === 'coins' && <ListedCoinsTable rows={listedCoins} popover={popover} />}
        {activeTab === 'promotions' && <PromotionsTable rows={listedCoins} popover={popover} />}
        {activeTab === 'banners' && <BannerAdsTable rows={bannerAds} popover={popover} />}
        {activeTab === 'users' && <UsersTable rows={users} popover={popover} />}
        {activeTab === 'reports' && <ChangeRequestsTable rows={changeRequests} popover={popover} />}
      </div>
    </div>
  );
}

function AdminOverview({
  summary,
  pendingSubmissions,
  changeRequests,
  promotedRows,
  bannerAds,
  onSelectTab,
}: {
  summary: AdminSummary;
  pendingSubmissions: AdminSubmissionRow[];
  changeRequests: AdminChangeRequestRow[];
  promotedRows: AdminCoinRow[];
  bannerAds: AdminBannerRow[];
  onSelectTab: (tab: AdminTab) => void;
}) {
  const scheduledBanners = bannerAds.filter((banner) => banner.status === 'scheduled').length;

  return (
    <section className="admin-overview">
      <div className="admin-dashboard-grid" aria-label="Admin summary">
        <SummaryCard label="Users" value={summary.users} />
        <SummaryCard label="Listed coins" value={summary.coins} />
        <SummaryCard label="Active boosts" value={summary.activeBoosts} />
        <SummaryCard label="Promoted coins" value={summary.promotedCoins} />
        <SummaryCard label="Active banners" value={summary.activeBanners} />
        <SummaryCard label="Pending submissions" value={summary.pendingSubmissions} />
        <SummaryCard label="Change requests" value={summary.changeRequests} />
      </div>

      <div className="admin-attention-grid">
        <OverviewQueueCard
          title="Submissions"
          value={pendingSubmissions.length}
          label="waiting for review"
          action="Review submissions"
          onClick={() => onSelectTab('submissions')}
        />
        <OverviewQueueCard
          title="Reports"
          value={changeRequests.filter((request) => request.status === 'pending').length}
          label="open requests"
          action="Open reports"
          onClick={() => onSelectTab('reports')}
        />
        <OverviewQueueCard
          title="Promotions"
          value={promotedRows.length}
          label="coins with visibility"
          action="Manage promotions"
          onClick={() => onSelectTab('promotions')}
        />
        <OverviewQueueCard
          title="Banner ads"
          value={scheduledBanners}
          label="scheduled banners"
          action="Manage banners"
          onClick={() => onSelectTab('banners')}
        />
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

function ChangeRequestsTable({
  rows,
  popover,
}: {
  rows: AdminChangeRequestRow[];
  popover: PopoverController;
}) {
  const [reportRow, setReportRow] = useState<AdminChangeRequestRow | null>(null);

  return (
    <>
      <AdminPanel
        eyebrow="Corrections"
        title="Change requests"
        count={`${rows.length} latest`}
        note="Reports and requested listing updates from coin pages. Review here, then update the database manually for now."
        rows={rows}
        searchPlaceholder="Search coin, email, or request"
        search={(row) => [
          row.coinName,
          row.coinSymbol,
          row.requesterEmail,
          row.requesterTelegram,
          row.requestedChanges,
          row.status,
        ]}
        empty={emptyTableMessage}
        renderTable={(visibleRows) => (
          <table className="admin-table admin-reports-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Email</th>
                <th>Telegram</th>
                <th>Report</th>
                <th>Evidence</th>
                <th>Date Submitted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.coinName}</strong>
                    <span className="admin-row-subtext">
                      {row.coinSymbol ? `$${row.coinSymbol}` : `#${row.coinId}`}
                    </span>
                  </td>
                  <td>{row.requesterEmail}</td>
                  <td>{row.requesterTelegram || '—'}</td>
                  <td className="admin-request-cell">
                    <button
                      className="admin-read-report-button"
                      type="button"
                      onClick={() => setReportRow(row)}
                    >
                      Read report
                    </button>
                  </td>
                  <td>
                    {row.evidenceUrl ? (
                      <a href={row.evidenceUrl} target="_blank" rel="noreferrer">
                        Open link ↗
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{row.submittedAt}</td>
                  <td>
                    <StatusPill tone={row.status === 'pending' ? 'warning' : 'neutral'}>
                      {labelize(row.status)}
                    </StatusPill>
                  </td>
                  <td>
                    <ActionGroup>
                      <CoinPageLinkAction coinId={row.coinId} name={row.coinName} />
                      <ConfirmAction
                        popover={popover}
                        popoverId={`change-resolve-${row.id}`}
                        action={updateChangeRequestStatus}
                        title="Mark resolved"
                        tone="success"
                        message={`Mark the request for ${row.coinName} as resolved?`}
                        fields={{ requestId: row.id, status: 'resolved' }}
                        disabled={row.status === 'resolved'}
                      >
                        <Check aria-hidden="true" />
                      </ConfirmAction>
                      <ConfirmAction
                        popover={popover}
                        popoverId={`change-reject-${row.id}`}
                        action={updateChangeRequestStatus}
                        title="Reject request"
                        tone="danger"
                        message={`Reject the request for ${row.coinName}?`}
                        fields={{ requestId: row.id, status: 'rejected' }}
                        disabled={row.status === 'rejected'}
                      >
                        <X aria-hidden="true" />
                      </ConfirmAction>
                    </ActionGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      />
      {reportRow && <ReportDetailsModal row={reportRow} onClose={() => setReportRow(null)} />}
    </>
  );
}

function ReportDetailsModal({ row, onClose }: { row: AdminChangeRequestRow; onClose: () => void }) {
  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  return createPortal(
    <div className="admin-detail-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="admin-detail-modal admin-report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-report-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-detail-modal-head">
          <div>
            <small>Report message</small>
            <h2 id="admin-report-details-title">{row.coinName}</h2>
            <p>
              {row.coinSymbol ? `$${row.coinSymbol}` : `Coin #${row.coinId}`} · {row.submittedAt}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close report details">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="admin-report-modal-body">
          <section>
            <h3>Message</h3>
            <p>{row.requestedChanges}</p>
          </section>
          <section>
            <h3>Contact</h3>
            <dl>
              <div>
                <dt>Email</dt>
                <dd>{row.requesterEmail}</dd>
              </div>
              <div>
                <dt>Telegram</dt>
                <dd>{row.requesterTelegram || '—'}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>
                  {row.evidenceUrl ? (
                    <a href={row.evidenceUrl} target="_blank" rel="noreferrer">
                      Open evidence ↗
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function PendingSubmissionsTable({
  rows,
  popover,
}: {
  rows: AdminSubmissionRow[];
  popover: PopoverController;
}) {
  const [detailRow, setDetailRow] = useState<AdminSubmissionRow | null>(null);

  return (
    <>
      <AdminPanel
        eyebrow="Review queue"
        title="Pending submissions"
        count={`${rows.length} pending`}
        note="Projects waiting for approval. They are not public coins until an admin approves them."
        rows={rows}
        searchPlaceholder="Search project, symbol, or chain"
        search={(row) => [row.name, row.symbol, row.chain, row.contactEmail, row.contactTelegram]}
        empty={emptyTableMessage}
        renderTable={(visibleRows) => (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Logo</th>
                <th>Project Name</th>
                <th>Symbol</th>
                <th>Chain</th>
                <th>Submitted By</th>
                <th>Contact Email</th>
                <th>Contact Telegram</th>
                <th>Date Submitted</th>
                <th>Status</th>
                <th>Flag</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <LogoUrlAction logoUrl={row.logoUrl} name={row.name} />
                  </td>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>{row.symbol ? `$${row.symbol}` : '—'}</td>
                  <td>{row.chain || '—'}</td>
                  <td>{row.submittedBy || '—'}</td>
                  <td>{row.contactEmail || '—'}</td>
                  <td>{row.contactTelegram || '—'}</td>
                  <td>{row.submittedAt}</td>
                  <td>
                    <StatusPill tone={row.status === 'pending' ? 'warning' : 'neutral'}>
                      {labelize(row.status)}
                    </StatusPill>
                  </td>
                  <td>{row.flag || '—'}</td>
                  <td>
                    <ActionGroup>
                      <button
                        type="button"
                        className="admin-icon-button neutral"
                        title="View full submission"
                        aria-label={`View full submission for ${row.name}`}
                        onClick={() => {
                          popover.setActivePopoverId(null);
                          setDetailRow(row);
                        }}
                      >
                        <Eye aria-hidden="true" />
                      </button>
                      <ConfirmAction
                        popover={popover}
                        popoverId={`submission-approve-${row.id}`}
                        action={updateAdminSubmission}
                        title="Approve submission"
                        tone="success"
                        message={`Approve ${row.name}? This will mark the submission as approved.`}
                        fields={{
                          submissionId: row.id,
                          status: 'approved',
                        }}
                      >
                        <Check aria-hidden="true" />
                      </ConfirmAction>
                      <ConfirmAction
                        popover={popover}
                        popoverId={`submission-reject-${row.id}`}
                        action={updateAdminSubmission}
                        title="Reject submission"
                        tone="danger"
                        message={`Reject ${row.name}? Add the reason so the review trail is clear.`}
                        fields={{
                          submissionId: row.id,
                          status: 'rejected',
                        }}
                        reasonName="reviewReason"
                        reasonPlaceholder="Reason required"
                      >
                        <X aria-hidden="true" />
                      </ConfirmAction>
                    </ActionGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      />
      {detailRow && <SubmissionDetailsModal row={detailRow} onClose={() => setDetailRow(null)} />}
    </>
  );
}

function ListedCoinsTable({ rows, popover }: { rows: AdminCoinRow[]; popover: PopoverController }) {
  return (
    <AdminPanel
      eyebrow="Public listings"
      title="Listed coins"
      count={`${rows.length} latest`}
      note="Coins already visible or controlled by listing status. Boost and promote status show admin-only countdowns here."
      rows={rows}
      searchPlaceholder="Search coin, symbol, or chain"
      search={(row) => [row.name, row.symbol, row.chain, row.contactEmail, row.contactTelegram]}
      empty={emptyTableMessage}
      renderTable={(visibleRows) => (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Logo</th>
              <th>Project Name</th>
              <th>Symbol</th>
              <th>Chain</th>
              <th>Submitted By</th>
              <th>Contact Email</th>
              <th>Contact Telegram</th>
              <th>Date Submitted</th>
              <th>Status</th>
              <th>Boost Status</th>
              <th>Promote Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const suspended = row.status !== 'active';
              return (
                <tr key={row.id}>
                  <td>
                    <LogoUrlAction logoUrl={row.logoUrl} name={row.name} />
                  </td>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>${row.symbol}</td>
                  <td>{row.chain || '—'}</td>
                  <td>{row.submittedBy || '—'}</td>
                  <td>{row.contactEmail || '—'}</td>
                  <td>{row.contactTelegram || '—'}</td>
                  <td>{row.submittedAt}</td>
                  <td>
                    <StatusPill tone={suspended ? 'danger' : 'lime'}>
                      {suspended ? 'Suspended' : 'Active'}
                    </StatusPill>
                  </td>
                  <td>
                    {row.boost ? (
                      <StatusPill tone="purple">
                        {row.boost.status} — {row.boost.tier}x, {row.boost.remaining} left
                      </StatusPill>
                    ) : (
                      <span>1x / no boost</span>
                    )}
                  </td>
                  <td>
                    {row.promotion ? (
                      <StatusPill tone="amber">
                        Promoted — {row.promotion.remaining} left
                      </StatusPill>
                    ) : (
                      <span>Not promoted</span>
                    )}
                  </td>
                  <td>
                    <ActionGroup>
                      <CoinPageLinkAction coinId={row.id} name={row.name} />
                      <ConfirmAction
                        popover={popover}
                        popoverId={`coin-status-${row.id}`}
                        action={updateAdminCoin}
                        title={suspended ? 'Activate coin' : 'Suspend coin'}
                        tone={suspended ? 'success' : 'danger'}
                        message={`${suspended ? 'Activate' : 'Suspend'} ${row.name}? Status will change from ${suspended ? 'Suspended' : 'Active'} to ${suspended ? 'Active' : 'Suspended'}.`}
                        fields={{
                          coinId: row.id,
                          listingStatus: suspended ? 'active' : 'suspended',
                          category: row.category,
                        }}
                      >
                        {suspended ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                      </ConfirmAction>
                      <ConfirmAction
                        popover={popover}
                        popoverId={`coin-delete-${row.id}`}
                        action={deleteAdminCoin}
                        title="Delete coin"
                        tone="danger"
                        message={`Delete ${row.name}? This removes the coin from the database.`}
                        fields={{ coinId: row.id }}
                      >
                        <Trash2 aria-hidden="true" />
                      </ConfirmAction>
                    </ActionGroup>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    />
  );
}

function PromotionsTable({ rows, popover }: { rows: AdminCoinRow[]; popover: PopoverController }) {
  return (
    <AdminPanel
      eyebrow="Visibility"
      title="Promotions & boosts"
      count={`${rows.filter((row) => row.boost || row.promotion).length} scheduled/live`}
      note="Boosts affect voting power. Promoted placements control paid visibility inventory."
      rows={rows}
      searchPlaceholder="Search coin, symbol, or chain"
      search={(row) => [row.name, row.symbol, row.chain, row.category]}
      empty={emptyTableMessage}
      renderTable={(visibleRows) => (
        <table className="admin-table admin-promotions-table">
          <thead>
            <tr>
              <th>Project Name</th>
              <th>Symbol</th>
              <th>Chain</th>
              <th>Status</th>
              <th>Boost</th>
              <th>Promoted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  <span className="admin-row-subtext">{row.category}</span>
                </td>
                <td>${row.symbol}</td>
                <td>{row.chain || '—'}</td>
                <td>
                  <StatusPill tone={row.status === 'active' ? 'lime' : 'danger'}>
                    {labelize(row.status)}
                  </StatusPill>
                </td>
                <td>
                  {row.boost ? (
                    <StatusPill tone="purple">
                      {row.boost.tier}x — {labelize(row.boost.status)} · {row.boost.remaining}
                    </StatusPill>
                  ) : (
                    <span>1x / no boost</span>
                  )}
                </td>
                <td>
                  {row.promotion ? (
                    <StatusPill tone="amber">
                      {labelize(row.promotion.status)} · {row.promotion.remaining}
                    </StatusPill>
                  ) : (
                    <span>Not promoted</span>
                  )}
                </td>
                <td>
                  <ActionGroup>
                    <CoinPageLinkAction coinId={row.id} name={row.name} />
                    <BoostAction row={row} popover={popover} />
                    <PromoteAction row={row} popover={popover} />
                    <ConfirmAction
                      popover={popover}
                      popoverId={`promotion-remove-boost-${row.id}`}
                      action={removeCoinBoost}
                      title="Cancel active boost"
                      tone="danger"
                      message={`Cancel the active boost for ${row.name}?`}
                      fields={{ coinId: row.id }}
                      disabled={!row.boost}
                    >
                      <Square aria-hidden="true" />
                    </ConfirmAction>
                    <ConfirmAction
                      popover={popover}
                      popoverId={`promotion-remove-promotion-${row.id}`}
                      action={removePromotedCoin}
                      title="Cancel promotion"
                      tone="danger"
                      message={`Cancel the active promotion for ${row.name}?`}
                      fields={{ coinId: row.id }}
                      disabled={!row.promotion}
                    >
                      <X aria-hidden="true" />
                    </ConfirmAction>
                  </ActionGroup>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}

function BannerAdsTable({ rows, popover }: { rows: AdminBannerRow[]; popover: PopoverController }) {
  return (
    <AdminPanel
      eyebrow="Banner inventory"
      title="Banner ads"
      count={`${rows.length} total`}
      note="Create, schedule, extend, or expire banner placements."
      rows={rows}
      searchPlaceholder="Search type, URL, or status"
      search={(row) => [row.placement, row.placementLabel, row.targetUrl, row.status]}
      empty={emptyTableMessage}
      action={<BannerEditAction popover={popover} />}
      renderTable={(visibleRows) => (
        <table className="admin-table banner-admin-table">
          <thead>
            <tr>
              <th>Creative</th>
              <th>Type</th>
              <th>Target</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              return (
                <tr key={row.id}>
                  <td>
                    <BannerPreviewAction row={row} />
                  </td>
                  <td>{row.placementLabel}</td>
                  <td>
                    <a href={row.targetUrl} target="_blank" rel="noreferrer">
                      Open target ↗
                    </a>
                  </td>
                  <td>
                    <StatusPill
                      tone={
                        row.status === 'active'
                          ? 'lime'
                          : row.status === 'scheduled'
                            ? 'amber'
                            : 'neutral'
                      }
                    >
                      {formatAdStatus(row.status)}
                    </StatusPill>
                    <span className="admin-row-subtext">{row.schedule}</span>
                  </td>
                  <td>{row.priority}</td>
                  <td>{row.startsAt}</td>
                  <td>{row.endsAt}</td>
                  <td>
                    <ActionGroup>
                      <BannerEditAction row={row} popover={popover} />
                      <ConfirmAction
                        popover={popover}
                        popoverId={`banner-delete-${row.id}`}
                        action={deleteBannerAd}
                        title="Delete banner"
                        tone="danger"
                        message={`Delete this ${row.placementLabel.toLowerCase()}? This removes the banner from admin inventory.`}
                        fields={{ bannerId: row.id }}
                      >
                        <Trash2 aria-hidden="true" />
                      </ConfirmAction>
                    </ActionGroup>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    />
  );
}

function UsersTable({ rows, popover }: { rows: AdminUserRow[]; popover: PopoverController }) {
  return (
    <AdminPanel
      eyebrow="Accounts"
      title="User management"
      count={`${rows.length} latest`}
      note="Users are sorted newest first. Admins can edit, suspend, or permanently delete accounts."
      rows={rows}
      searchPlaceholder="Search name or email"
      search={(row) => [row.name, row.email, row.role, row.status, row.lastIp]}
      empty={emptyTableMessage}
      renderTable={(visibleRows) => (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Avatar</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Projects Submitted</th>
              <th>Date Joined</th>
              <th>Last Active</th>
              <th>Last IP Used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const suspended = row.status === 'suspended';
              return (
                <tr key={row.id}>
                  <td>
                    <span className={`admin-avatar tone-${row.avatarTone}`}>{row.avatar}</span>
                  </td>
                  <td>
                    <strong>{row.name || 'Unnamed user'}</strong>
                  </td>
                  <td>{row.email}</td>
                  <td>
                    <StatusPill tone={row.role === 'admin' ? 'lime' : 'neutral'}>
                      {labelize(row.role)}
                    </StatusPill>
                  </td>
                  <td>
                    <StatusPill tone={suspended ? 'danger' : 'lime'}>
                      {suspended ? 'Suspended' : 'Active'}
                    </StatusPill>
                  </td>
                  <td>{row.projectsSubmitted}</td>
                  <td>{row.joinedAt}</td>
                  <td>{row.lastActive}</td>
                  <td>{row.lastIp}</td>
                  <td>
                    <ActionGroup>
                      <UserEditAction row={row} popover={popover} />
                      <ConfirmAction
                        popover={popover}
                        popoverId={`user-status-${row.id}`}
                        action={updateAdminUser}
                        title={suspended ? 'Activate user' : 'Suspend user'}
                        tone={suspended ? 'success' : 'danger'}
                        message={`${suspended ? 'Activate' : 'Suspend'} ${row.email}? Status will change from ${suspended ? 'Suspended' : 'Active'} to ${suspended ? 'Active' : 'Suspended'}.`}
                        fields={{
                          userId: row.id,
                          name: row.name,
                          email: row.email,
                          role: row.role || 'user',
                          banned: suspended ? '' : 'on',
                        }}
                      >
                        {suspended ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                      </ConfirmAction>
                      <ConfirmAction
                        popover={popover}
                        popoverId={`user-delete-${row.id}`}
                        action={deleteAdminUser}
                        title="Delete user"
                        tone="danger"
                        message={`Delete ${row.email}? This removes the user account from the database.`}
                        fields={{ userId: row.id }}
                      >
                        <Trash2 aria-hidden="true" />
                      </ConfirmAction>
                    </ActionGroup>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    />
  );
}

function AdminPanel<T>({
  eyebrow,
  title,
  count,
  note,
  rows,
  searchPlaceholder,
  search,
  empty,
  action,
  renderTable,
}: {
  eyebrow: string;
  title: string;
  count: string;
  note: string;
  rows: T[];
  searchPlaceholder: string;
  search: (row: T) => string[];
  empty: string;
  action?: ReactNode;
  renderTable: (rows: T[]) => ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      normalizedQuery
        ? rows.filter((row) =>
            search(row).some((value) => value.toLowerCase().includes(normalizedQuery)),
          )
        : rows,
    [normalizedQuery, rows, search],
  );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = filteredRows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const pageItems = getPaginationItems({ count: pageCount, page: safePage + 1 });

  return (
    <section className="admin-panel">
      <div className="admin-panel-title">
        <div>
          <small>{eyebrow}</small>
          <h2>{title}</h2>
        </div>
        <div className="admin-panel-title-actions">
          {action}
          <span>{count}</span>
        </div>
      </div>
      <p className="admin-panel-note">{note}</p>
      <div className="admin-table-tools">
        <label className="admin-search">
          <Search aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
          />
        </label>
        <span>
          {filteredRows.length} result{filteredRows.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="admin-table-wrap">
        {visibleRows.length ? (
          renderTable(visibleRows)
        ) : (
          <div className="admin-empty-state">{empty}</div>
        )}
      </div>
      <div className="admin-pagination">
        <span>
          Page {safePage + 1} of {pageCount}
        </span>
        <div>
          <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            Previous
          </button>
          {pageItems.map((item) =>
            typeof item === 'number' ? (
              <button
                key={item}
                className={safePage + 1 === item ? 'active' : ''}
                type="button"
                onClick={() => setPage(item - 1)}
              >
                {item}
              </button>
            ) : (
              <span className="admin-pagination-ellipsis" key={item} aria-hidden="true">
                ...
              </span>
            ),
          )}
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function BoostAction({ row, popover }: { row: AdminCoinRow; popover: PopoverController }) {
  const [tier, setTier] = useState(row.boost?.tier || 50);
  const [startDate, setStartDate] = useState(row.boost?.startDate || '');
  const [extensionDays, setExtensionDays] = useState(1);
  const selected = boostPackages.find((item) => item.value === tier) || boostPackages[2];
  const active = row.boost?.status === 'active';
  const scheduled = row.boost?.status === 'scheduled';
  const minStartDate = todayUtcInputDate();
  const message = active
    ? `Add ${extensionDays} day${extensionDays === 1 ? '' : 's'} to the active ${row.boost?.tier}x boost.`
    : scheduled
      ? `Update the scheduled boost for ${row.name}.`
      : `Give ${row.name} the ${selected.label} boost package for ${selected.detail}.`;

  return (
    <ConfirmAction
      popover={popover}
      popoverId={`coin-boost-${row.id}`}
      action={grantCoinBoost}
      title={active ? 'Extend boost' : scheduled ? 'Edit boost' : 'Boost project'}
      tone="boost"
      message={message}
      fields={{ coinId: row.id, multiplier: tier }}
      extra={
        <div className="admin-schedule-form">
          {active ? (
            <>
              <label>
                Start date (UTC)
                <input type="date" value={row.boost?.startDate || startDate} disabled />
              </label>
              <label>
                Add days
                <input
                  name="extensionDays"
                  type="number"
                  min={1}
                  max={365}
                  value={extensionDays}
                  onChange={(event) =>
                    setExtensionDays(Math.max(1, Number(event.target.value) || 1))
                  }
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Start date (UTC)
                <input
                  name="startDate"
                  type="date"
                  min={minStartDate}
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label>
                Boost tier
                <select
                  name="multiplier"
                  value={tier}
                  onChange={(event) => setTier(Number(event.target.value))}
                >
                  {boostPackages.map((boost) => (
                    <option key={boost.value} value={boost.value}>
                      {boost.label} — {boost.detail}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="admin-banner-form-wide">
            Notes
            <textarea name="notes" placeholder="Internal notes" />
          </label>
          {!active && (
            <small className="admin-banner-form-wide">
              Pick a start date to begin at 12:00 AM UTC. Leave it blank to start immediately.
            </small>
          )}
        </div>
      }
    >
      <Zap aria-hidden="true" />
    </ConfirmAction>
  );
}

function PromoteAction({ row, popover }: { row: AdminCoinRow; popover: PopoverController }) {
  const [days, setDays] = useState(row.promotion?.durationDays || 1);
  const [startDate, setStartDate] = useState(row.promotion?.startDate || '');
  const [extensionDays, setExtensionDays] = useState(1);
  const active = row.promotion?.status === 'active';
  const scheduled = row.promotion?.status === 'scheduled';
  const minStartDate = todayUtcInputDate();
  const message = active
    ? `Add ${extensionDays} day${extensionDays === 1 ? '' : 's'} to the active promotion.`
    : scheduled
      ? `Update the scheduled promotion for ${row.name}.`
      : `Promote ${row.name} for ${days} day${days === 1 ? '' : 's'}.`;

  return (
    <ConfirmAction
      popover={popover}
      popoverId={`coin-promote-${row.id}`}
      action={addPromotedCoin}
      title={active ? 'Extend promotion' : scheduled ? 'Edit promotion' : 'Promote project'}
      tone="boost"
      message={message}
      fields={{ coinId: row.id, durationDays: days, priority: row.promotion?.priority || 1 }}
      extra={
        <div className="admin-schedule-form">
          {active ? (
            <>
              <label>
                Start date (UTC)
                <input type="date" value={row.promotion?.startDate || startDate} disabled />
              </label>
              <label>
                Add days
                <input
                  name="extensionDays"
                  type="number"
                  min={1}
                  max={365}
                  value={extensionDays}
                  onChange={(event) =>
                    setExtensionDays(Math.max(1, Number(event.target.value) || 1))
                  }
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Start date (UTC)
                <input
                  name="startDate"
                  type="date"
                  min={minStartDate}
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label>
                Duration (days)
                <input
                  name="durationDays"
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(event) => setDays(Math.max(1, Number(event.target.value) || 1))}
                  required
                />
              </label>
            </>
          )}
          <label className="admin-banner-form-wide">
            Notes
            <textarea name="notes" placeholder="Internal notes" />
          </label>
          {!active && (
            <small className="admin-banner-form-wide">
              Pick a start date to begin at 12:00 AM UTC. Leave it blank to start immediately.
            </small>
          )}
        </div>
      }
    >
      <Megaphone aria-hidden="true" />
    </ConfirmAction>
  );
}

function BannerEditAction({ row, popover }: { row?: AdminBannerRow; popover: PopoverController }) {
  const [placement, setPlacement] = useState<BannerPlacement>(
    isBannerPlacement(row?.placement) ? row.placement : 'premium',
  );
  const [desktopImageUrl, setDesktopImageUrl] = useState(row?.desktopImageUrl || '');
  const [mobileImageUrl, setMobileImageUrl] = useState(row?.mobileImageUrl || '');
  const [targetUrl, setTargetUrl] = useState(row?.targetUrl || '');
  const [priority, setPriority] = useState(row?.priority || 1);
  const [startDate, setStartDate] = useState(row?.startDate || '');
  const [durationDays, setDurationDays] = useState(row?.durationDays || 1);
  const [extensionDays, setExtensionDays] = useState(1);
  const [notes, setNotes] = useState(row?.notes || '');
  const editing = Boolean(row);
  const inactive = row?.status === 'inactive';
  const active = row?.status === 'active';
  const minStartDate = todayUtcInputDate();

  return (
    <ConfirmAction
      popover={popover}
      popoverId={editing ? `banner-edit-${row?.id}` : 'banner-create'}
      action={editing ? updateBannerAd : createBannerAd}
      title={active ? 'Extend banner' : editing ? 'Edit banner' : 'New banner'}
      tone={editing ? 'neutral' : 'boost'}
      message={
        inactive
          ? 'This ad has expired. Create a new booking if the advertiser wants to run again.'
          : active
            ? `Add more days to this active ${row?.placementLabel || 'banner'} booking.`
            : editing
              ? `Update this scheduled ${row?.placementLabel || 'banner'} before it goes live.`
              : 'Create a paid banner placement using the advertiser creative and destination link.'
      }
      fields={editing && row ? { bannerId: row.id } : {}}
      disabled={inactive}
      triggerClassName={!editing ? 'admin-create-button' : undefined}
      extra={
        <div className="admin-banner-form">
          <label>
            Banner type
            <select
              name="placement"
              value={placement}
              onChange={(event) => setPlacement(event.target.value as BannerPlacement)}
            >
              {bannerPlacements.map((item) => (
                <option key={item} value={item}>
                  {bannerPlacementLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <input
              name="priority"
              type="number"
              min={1}
              max={999}
              value={priority}
              onChange={(event) => setPriority(Math.max(1, Number(event.target.value) || 1))}
              required
            />
          </label>
          {active ? (
            <>
              <label>
                Start date (UTC)
                <input type="date" value={row?.startDate || startDate} disabled />
              </label>
              <label>
                Add days
                <input
                  name="extensionDays"
                  type="number"
                  min={0}
                  max={365}
                  value={extensionDays}
                  onChange={(event) =>
                    setExtensionDays(Math.max(0, Number(event.target.value) || 0))
                  }
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Start date (UTC)
                <input
                  name="startDate"
                  type="date"
                  min={minStartDate}
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label>
                Duration (days)
                <input
                  name="durationDays"
                  type="number"
                  min={1}
                  max={365}
                  value={durationDays}
                  onChange={(event) =>
                    setDurationDays(Math.max(1, Number(event.target.value) || 1))
                  }
                  required
                />
              </label>
            </>
          )}
          <label className="admin-banner-form-wide">
            Desktop image URL
            <input
              name="desktopImageUrl"
              value={desktopImageUrl}
              onChange={(event) => setDesktopImageUrl(event.target.value)}
              placeholder="https://..."
              required
            />
          </label>
          <label className="admin-banner-form-wide">
            Mobile image URL
            <input
              name="mobileImageUrl"
              value={mobileImageUrl}
              onChange={(event) => setMobileImageUrl(event.target.value)}
              placeholder="https://..."
              required
            />
          </label>
          <label className="admin-banner-form-wide">
            Target URL
            <input
              name="targetUrl"
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              placeholder="https://..."
              required
            />
          </label>
          <label className="admin-banner-form-wide">
            Notes
            <textarea
              name="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Internal notes"
            />
          </label>
          <small className="admin-banner-form-wide">
            Pick a start date to begin at 12:00 AM UTC. Leave it blank to start immediately.
          </small>
        </div>
      }
    >
      {editing ? (
        <Pencil aria-hidden="true" />
      ) : (
        <>
          <IconifyIcon icon="lucide:plus" aria-hidden="true" />
          <span>Create</span>
        </>
      )}
    </ConfirmAction>
  );
}

function BannerPreviewAction({ row }: { row: AdminBannerRow }) {
  return (
    <div className="admin-banner-preview-actions">
      <a
        className="admin-icon-button neutral"
        href={row.desktopImageUrl}
        target="_blank"
        rel="noreferrer"
        title={`Open ${row.placementLabel} desktop image`}
        aria-label={`Open ${row.placementLabel} desktop image`}
      >
        <ImageIcon aria-hidden="true" />
      </a>
      {row.mobileImageUrl && (
        <a
          className="admin-icon-button neutral"
          href={row.mobileImageUrl}
          target="_blank"
          rel="noreferrer"
          title={`Open ${row.placementLabel} mobile image`}
          aria-label={`Open ${row.placementLabel} mobile image`}
        >
          <ExternalLink aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

function UserEditAction({ row, popover }: { row: AdminUserRow; popover: PopoverController }) {
  const [name, setName] = useState(row.name);
  const [email, setEmail] = useState(row.email);
  const [role, setRole] = useState(row.role || 'user');
  const changes = [
    name !== row.name ? `Name will change from ${row.name || 'blank'} to ${name || 'blank'}.` : '',
    email !== row.email ? `Email will change from ${row.email} to ${email}.` : '',
    role !== row.role ? `Role will change from ${row.role || 'user'} to ${role}.` : '',
  ].filter(Boolean);

  return (
    <ConfirmAction
      popover={popover}
      popoverId={`user-edit-${row.id}`}
      action={updateAdminUser}
      title="Edit user"
      tone="neutral"
      message={changes.length ? changes.join(' ') : 'No changes selected.'}
      fields={{
        userId: row.id,
        banned: row.status === 'suspended' ? 'on' : '',
      }}
      extra={
        <>
          <label>
            Name
            <input name="name" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Email
            <input name="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Role
            <select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </>
      }
    >
      <Pencil aria-hidden="true" />
    </ConfirmAction>
  );
}

function SubmissionDetailsModal({
  row,
  onClose,
}: {
  row: AdminSubmissionRow;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  return createPortal(
    <div className="admin-detail-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="admin-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-submission-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-detail-modal-head">
          <div>
            <small>Full submission</small>
            <h2 id="admin-submission-details-title">{row.name}</h2>
            <p>
              {row.symbol ? `$${row.symbol}` : 'No symbol'} · {row.chain || 'No chain'} ·{' '}
              {row.submittedAt}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close submission details">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="admin-detail-sections">
          {row.details.map((section) => (
            <section className="admin-detail-section" key={section.title}>
              <h3>{section.title}</h3>
              <div>
                {section.rows.map((item) => (
                  <p key={`${section.title}-${item.label}`}>
                    <span>{item.label}</span>
                    <b>{item.value || '—'}</b>
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <details className="admin-raw-json">
          <summary>Raw submission JSON</summary>
          <pre>{row.rawData}</pre>
        </details>
      </section>
    </div>,
    document.body,
  );
}

function ConfirmAction({
  popover,
  popoverId,
  action,
  title,
  tone,
  message,
  fields,
  reasonName,
  reasonPlaceholder,
  extra,
  disabled,
  triggerClassName,
  children,
}: {
  popover: PopoverController;
  popoverId: string;
  action: (formData: FormData) => Promise<void>;
  title: string;
  tone: 'neutral' | 'success' | 'danger' | 'boost';
  message: string;
  fields: Record<string, string | number>;
  reasonName?: string;
  reasonPlaceholder?: string;
  extra?: ReactNode;
  disabled?: boolean;
  triggerClassName?: string;
  children: ReactNode;
}) {
  const open = popover.activePopoverId === popoverId;
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverPosition = usePopoverPosition(open, buttonRef);
  const confirmLabel =
    status === 'saving' ? 'Saving...' : status === 'success' ? 'Saved' : 'Confirm';

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  return (
    <span className="admin-confirm-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={triggerClassName || `admin-icon-button ${tone}`}
        title={title}
        aria-label={title}
        disabled={disabled || isPending}
        onClick={() => {
          setFeedback('');
          setStatus('idle');
          popover.setActivePopoverId(open ? null : popoverId);
        }}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <form
            className="admin-confirm-popover"
            style={popoverPosition}
            aria-busy={status === 'saving'}
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startTransition(async () => {
                setStatus('saving');
                setFeedback('Saving changes...');
                try {
                  await action(formData);
                  setStatus('success');
                  setFeedback('Saved. Refreshing...');
                  successTimerRef.current = setTimeout(() => {
                    popover.setActivePopoverId(null);
                    router.refresh();
                  }, 450);
                } catch (error) {
                  setStatus('error');
                  setFeedback(error instanceof Error ? error.message : 'Could not save changes.');
                }
              });
            }}
          >
            <strong>{title}</strong>
            <p>{message}</p>
            {Object.entries(fields).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            {reasonName && (
              <label>
                Reason
                <textarea name={reasonName} required placeholder={reasonPlaceholder} />
              </label>
            )}
            {extra}
            <div className="admin-confirm-actions">
              <button
                type="submit"
                className={`admin-confirm-submit ${status}`}
                disabled={isPending || status === 'saving' || status === 'success'}
              >
                {status === 'saving' && (
                  <span className="admin-button-spinner" aria-hidden="true" />
                )}
                {confirmLabel}
              </button>
              <button
                type="button"
                className="admin-confirm-cancel"
                disabled={isPending || status === 'saving' || status === 'success'}
                onClick={() => {
                  setStatus('idle');
                  setFeedback('');
                  popover.setActivePopoverId(null);
                }}
              >
                Cancel
              </button>
            </div>
            {feedback && <small className={`admin-confirm-feedback ${status}`}>{feedback}</small>}
          </form>,
          document.body,
        )}
    </span>
  );
}

function ActionGroup({ children }: { children: ReactNode }) {
  return <div className="admin-icon-actions">{children}</div>;
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function StatusPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'lime' | 'warning' | 'danger' | 'amber' | 'purple';
}) {
  return <span className={`admin-status-pill ${tone}`}>{children}</span>;
}

function LogoUrlAction({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  if (!logoUrl) return <span className="admin-empty-cell">—</span>;

  return (
    <a
      className="admin-icon-button neutral"
      href={logoUrl}
      target="_blank"
      rel="noreferrer"
      title={`Open ${name} logo`}
      aria-label={`Open ${name} logo`}
    >
      <ExternalLink aria-hidden="true" />
    </a>
  );
}

function CoinPageLinkAction({ coinId, name }: { coinId: number; name: string }) {
  return (
    <a
      className="admin-icon-button neutral"
      href={`/coin/${coinId}`}
      target="_blank"
      rel="noreferrer"
      title={`Open ${name} coin page`}
      aria-label={`Open ${name} coin page`}
    >
      <ExternalLink aria-hidden="true" />
    </a>
  );
}

function usePopoverPosition(open: boolean, buttonRef: RefObject<HTMLButtonElement | null>) {
  const [position, setPosition] = useState<CSSProperties>({
    position: 'fixed',
    top: '50%',
    left: '50%',
    width: 'min(420px, calc(100vw - 32px))',
    opacity: 0,
    pointerEvents: 'none',
    transform: 'translate(-50%, -50%)',
  });

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const width = Math.min(420, window.innerWidth - 32);
      const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16);
      const gap = 10;
      const viewportPadding = 16;
      const availableBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
      const availableAbove = rect.top - gap - viewportPadding;
      const minUsefulHeight = 260;
      const viewportMaxHeight = Math.max(160, window.innerHeight - viewportPadding * 2);
      const clampPopoverHeight = (availableSpace: number) =>
        Math.max(160, Math.min(viewportMaxHeight, availableSpace));
      const nextPosition: CSSProperties = {
        position: 'fixed',
        width,
        left,
        maxHeight: viewportMaxHeight,
        opacity: 1,
        pointerEvents: 'auto',
      };

      if (availableBelow >= minUsefulHeight || availableBelow >= availableAbove) {
        nextPosition.top = Math.min(rect.bottom + gap, window.innerHeight - viewportPadding);
        nextPosition.maxHeight = clampPopoverHeight(availableBelow);
      } else {
        nextPosition.bottom = Math.min(
          window.innerHeight - rect.top + gap,
          window.innerHeight - viewportPadding,
        );
        nextPosition.maxHeight = clampPopoverHeight(availableAbove);
      }

      setPosition(nextPosition);
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [buttonRef, open]);

  return position;
}

function labelize(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatAdStatus(value: string) {
  if (value === 'inactive') return 'Expired';
  return labelize(value);
}

function isBannerPlacement(value: string | undefined): value is BannerPlacement {
  return bannerPlacements.includes(value as BannerPlacement);
}

function isAdminTab(value: string | null): value is AdminTab {
  return adminTabs.some((tab) => tab.id === value);
}

function todayUtcInputDate() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
