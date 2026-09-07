'use client';

import {
  addPromotedCoin,
  deleteAdminCoin,
  grantCoinBoost,
  removeCoinBoost,
  removePromotedCoin,
  updateAdminCoin,
} from '@/app/admin/dashboard/actions';
import { Megaphone, Pause, Play, Square, Trash2, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { CoinPageLinkAction, ConfirmAction, LogoUrlAction } from './admin-actions';
import { AdminPanel } from './admin-panel';
import { ActionGroup, StatusPill } from './admin-primitives';
import type { AdminCoinRow, AdminTablePagination, PopoverController } from '../types';
import { labelize, todayUtcInputDate } from '../utils';

const emptyTableMessage = 'There is currently no items available to display.';
const boostPackages = [
  { value: 10, label: '10x', detail: 'votes ×2 · 24h' },
  { value: 30, label: '30x', detail: 'votes ×2 · 72h' },
  { value: 50, label: '50x', detail: 'votes ×3 · 24h' },
  { value: 100, label: '100x', detail: 'votes ×3 · 72h' },
  { value: 500, label: '500x', detail: 'votes ×5 · 168h' },
];

export function ListedCoinsTable({
  rows,
  popover,
  pagination,
  searchQuery,
  isPending,
  onPageChange,
  onSearchChange,
}: {
  rows: AdminCoinRow[];
  popover: PopoverController;
  pagination?: AdminTablePagination | null;
  searchQuery?: string;
  isPending?: boolean;
  onPageChange?: (page: number) => void;
  onSearchChange?: (query: string) => void;
}) {
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
      pagination={pagination}
      searchQuery={searchQuery}
      isPending={isPending}
      onPageChange={onPageChange}
      onSearchChange={onSearchChange}
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
                  <td>{row.symbol}</td>
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
                      <BoostAction row={row} popover={popover} />
                      <PromoteAction row={row} popover={popover} />
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

export function PromotionsTable({
  rows,
  popover,
  pagination,
  searchQuery,
  isPending,
  onPageChange,
  onSearchChange,
}: {
  rows: AdminCoinRow[];
  popover: PopoverController;
  pagination?: AdminTablePagination | null;
  searchQuery?: string;
  isPending?: boolean;
  onPageChange?: (page: number) => void;
  onSearchChange?: (query: string) => void;
}) {
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
      pagination={pagination}
      searchQuery={searchQuery}
      isPending={isPending}
      onPageChange={onPageChange}
      onSearchChange={onSearchChange}
      renderTable={(visibleRows) => (
        <table className="admin-table admin-promotions-table">
          <thead>
            <tr>
              <th>Logo</th>
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
                  <LogoUrlAction logoUrl={row.logoUrl} name={row.name} />
                </td>
                <td>
                  <strong>{row.name}</strong>
                  <span className="admin-row-subtext">{row.category}</span>
                </td>
                <td>{row.symbol}</td>
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
                  value={days}
                  onChange={(event) => setDays(Math.max(0, Number(event.target.value) || 0))}
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
