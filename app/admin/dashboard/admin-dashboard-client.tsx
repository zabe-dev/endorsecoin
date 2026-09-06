'use client';

import { AdminOverview } from './components/admin-overview';
import { ChangeRequestsTable } from './components/change-requests-table';
import { PendingAirdropsTable, PendingSubmissionsTable } from './components/submission-tables';
import { ListedCoinsTable, PromotionsTable } from './components/coin-tables';
import { BannerAdsTable } from './components/banner-ads-table';
import { UsersTable } from './components/users-table';
import type { AdminDashboardClientProps, AdminSummary, AdminTab } from './types';
import {
  ExternalLink,
  Eye,
  Gift,
  Image as ImageIcon,
  LayoutDashboard,
  Megaphone,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

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
  searchQuery = '',
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
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    else params.delete('search');
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
    params.delete('search');
    const query = params.toString();
    const href = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    startTabTransition(() => router.replace(href, { scroll: false }));
  }

  function searchAdmin(nextQuery: string) {
    if (isTabPending) return;
    const params = new URLSearchParams(window.location.search);
    if (activeTab === 'overview') params.delete('tab');
    else params.set('tab', activeTab);
    params.delete('page');
    if (nextQuery.trim()) params.set('search', nextQuery.trim());
    else params.delete('search');
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
            searchQuery={searchQuery}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
            onSearchChange={searchAdmin}
          />
        )}
        {activeTab === 'airdrops' && (
          <PendingAirdropsTable
            rows={pendingAirdropSubmissions}
            popover={popover}
            pagination={pagination}
            searchQuery={searchQuery}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
            onSearchChange={searchAdmin}
          />
        )}
        {activeTab === 'coins' && (
          <ListedCoinsTable
            rows={listedCoins}
            popover={popover}
            pagination={pagination}
            searchQuery={searchQuery}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
            onSearchChange={searchAdmin}
          />
        )}
        {activeTab === 'promotions' && (
          <PromotionsTable
            rows={listedCoins}
            popover={popover}
            pagination={pagination}
            searchQuery={searchQuery}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
            onSearchChange={searchAdmin}
          />
        )}
        {activeTab === 'banners' && (
          <BannerAdsTable
            rows={bannerAds}
            popover={popover}
            pagination={pagination}
            searchQuery={searchQuery}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
            onSearchChange={searchAdmin}
          />
        )}
        {activeTab === 'users' && (
          <UsersTable
            rows={users}
            popover={popover}
            pagination={pagination}
            searchQuery={searchQuery}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
            onSearchChange={searchAdmin}
          />
        )}
        {activeTab === 'reports' && (
          <ChangeRequestsTable
            rows={changeRequests}
            popover={popover}
            pagination={pagination}
            searchQuery={searchQuery}
            isPending={isTabPending}
            onPageChange={goToAdminPage}
            onSearchChange={searchAdmin}
          />
        )}
      </div>
    </div>
  );
}

function isAdminTab(value: string | null): value is AdminTab {
  return adminTabs.some((tab) => tab.id === value);
}
