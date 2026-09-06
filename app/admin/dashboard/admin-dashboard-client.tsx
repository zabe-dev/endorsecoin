'use client';

import {
  createBannerAd,
  deleteAdminUser,
  deleteBannerAd,
  updateAdminUser,
  updateBannerAd,
} from '@/app/admin/dashboard/actions';
import {
  bannerPlacementLabels,
  bannerPlacements,
  type BannerPlacement,
} from '@/features/ads/types';
import { AdminPanel } from './components/admin-panel';
import { AdminOverview } from './components/admin-overview';
import { ActionGroup, StatusPill } from './components/admin-primitives';
import { ConfirmAction } from './components/admin-actions';
import { ChangeRequestsTable } from './components/change-requests-table';
import { PendingAirdropsTable, PendingSubmissionsTable } from './components/submission-tables';
import { ListedCoinsTable, PromotionsTable } from './components/coin-tables';
import { formatAdStatus, labelize, todayUtcInputDate } from './utils';
import type {
  AdminBannerRow,
  AdminDashboardClientProps,
  AdminSummary,
  AdminTab,
  AdminTablePagination,
  AdminUserRow,
  PopoverController,
} from './types';
import { Icon as IconifyIcon } from '@iconify/react';
import {
  ExternalLink,
  Eye,
  Gift,
  Image as ImageIcon,
  LayoutDashboard,
  Megaphone,
  Pause,
  Pencil,
  Play,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const emptyTableMessage = 'There is currently no items available to display.';

const adminTabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'submissions', label: 'Submissions', icon: Eye },
  { id: 'airdrops', label: 'Airdrops', icon: Gift },
  { id: 'coins', label: 'Coins', icon: ExternalLink },
  { id: 'promotions', label: 'Promotions', icon: Megaphone },
  { id: 'banners', label: 'Banner ads', icon: ImageIcon },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'reports', label: 'Reports', icon: ShieldAlert },
] as const;

const tabCounts = (summary: AdminSummary) =>
  ({
    overview: 0,
    submissions: summary.pendingSubmissions,
    airdrops: summary.pendingAirdrops,
    coins: summary.coins,
    promotions: summary.activeBoosts + summary.promotedCoins,
    banners: summary.activeBanners,
    users: summary.users,
    reports: summary.changeRequests,
  }) satisfies Record<AdminTab, number>;

export function AdminDashboardClient({
  summary,
  pendingSubmissions,
  pendingAirdropSubmissions,
  changeRequests,
  listedCoins,
  bannerAds,
  users,
  initialTab,
  pagination,
}: AdminDashboardClientProps) {
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);
  const safeInitialTab: AdminTab = isAdminTab(initialTab || null)
    ? (initialTab as AdminTab)
    : 'overview';
  const activeTab = safeInitialTab;
  const [isTabPending, startTabTransition] = useTransition();
  const router = useRouter();
  const popover = { activePopoverId, setActivePopoverId };
  const counts = tabCounts(summary);

  function goToAdminPage(nextPage: number) {
    if (isTabPending) return;
    const params = new URLSearchParams(window.location.search);
    if (activeTab === 'overview') params.delete('tab');
    else params.set('tab', activeTab);
    if (nextPage <= 1) params.delete('page');
    else params.set('page', String(nextPage));
    const query = params.toString();
    const href = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    startTabTransition(() => router.replace(href, { scroll: false }));
  }

  function switchTab(nextTab: AdminTab) {
    setActivePopoverId(null);
    const params = new URLSearchParams(window.location.search);
    if (nextTab === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', nextTab);
    }
    params.delete('page');
    const query = params.toString();
    const href = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    startTabTransition(() => router.replace(href, { scroll: false }));
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
              disabled={isTabPending}
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
        {activeTab === 'overview' && <AdminOverview summary={summary} onSelectTab={switchTab} />}
        {activeTab === 'submissions' && (
          <PendingSubmissionsTable
            rows={pendingSubmissions}
            popover={popover}
            title="Pending submissions"
            note="Projects waiting for approval. They become public only after admin review."
            searchPlaceholder="Search project, symbol, or chain"
            pagination={pagination}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
          />
        )}
        {activeTab === 'airdrops' && (
          <PendingAirdropsTable
            rows={pendingAirdropSubmissions}
            popover={popover}
            pagination={pagination}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
          />
        )}
        {activeTab === 'coins' && (
          <ListedCoinsTable
            rows={listedCoins}
            popover={popover}
            pagination={pagination}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
          />
        )}
        {activeTab === 'promotions' && (
          <PromotionsTable
            rows={listedCoins}
            popover={popover}
            pagination={pagination}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
          />
        )}
        {activeTab === 'banners' && (
          <BannerAdsTable
            rows={bannerAds}
            popover={popover}
            pagination={pagination}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
          />
        )}
        {activeTab === 'users' && (
          <UsersTable
            rows={users}
            popover={popover}
            pagination={pagination}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
          />
        )}
        {activeTab === 'reports' && (
          <ChangeRequestsTable
            rows={changeRequests}
            popover={popover}
            pagination={pagination}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
          />
        )}
      </div>
    </div>
  );
}

function BannerAdsTable({
  rows,
  popover,
  pagination,
  isPending,
  onPageChange,
}: {
  rows: AdminBannerRow[];
  popover: PopoverController;
  pagination?: AdminTablePagination | null;
  isPending?: boolean;
  onPageChange?: (page: number) => void;
}) {
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
      pagination={pagination}
      isPending={isPending}
      onPageChange={onPageChange}
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

function UsersTable({
  rows,
  popover,
  pagination,
  isPending,
  onPageChange,
}: {
  rows: AdminUserRow[];
  popover: PopoverController;
  pagination?: AdminTablePagination | null;
  isPending?: boolean;
  onPageChange?: (page: number) => void;
}) {
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
      pagination={pagination}
      isPending={isPending}
      onPageChange={onPageChange}
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

function isBannerPlacement(value: string | undefined): value is BannerPlacement {
  return bannerPlacements.includes(value as BannerPlacement);
}

function isAdminTab(value: string | null): value is AdminTab {
  return adminTabs.some((tab) => tab.id === value);
}
