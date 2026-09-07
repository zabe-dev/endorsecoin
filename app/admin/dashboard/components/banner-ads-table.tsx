'use client';

import { createBannerAd, deleteBannerAd, updateBannerAd } from '@/app/admin/dashboard/actions';
import {
  bannerPlacementLabels,
  bannerPlacements,
  type BannerPlacement,
} from '@/features/ads/types';
import { Icon as IconifyIcon } from '@iconify/react';
import { ExternalLink, Image as ImageIcon, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmAction } from './admin-actions';
import { AdminPanel } from './admin-panel';
import { ActionGroup, StatusPill } from './admin-primitives';
import type { AdminBannerRow, AdminTablePagination, PopoverController } from '../types';
import { formatAdStatus, todayUtcInputDate } from '../utils';

const emptyTableMessage = 'There is currently no items available to display.';

export function BannerAdsTable({
  rows,
  popover,
  pagination,
  searchQuery,
  isPending,
  onPageChange,
  onSearchChange,
}: {
  rows: AdminBannerRow[];
  popover: PopoverController;
  pagination?: AdminTablePagination | null;
  searchQuery?: string;
  isPending?: boolean;
  onPageChange?: (page: number) => void;
  onSearchChange?: (query: string) => void;
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
      searchQuery={searchQuery}
      isPending={isPending}
      onPageChange={onPageChange}
      onSearchChange={onSearchChange}
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
                  min={0}
                  max={365}
                  value={durationDays}
                  onChange={(event) =>
                    setDurationDays(Math.max(0, Number(event.target.value) || 0))
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

function isBannerPlacement(value: string | undefined): value is BannerPlacement {
  return bannerPlacements.includes(value as BannerPlacement);
}
