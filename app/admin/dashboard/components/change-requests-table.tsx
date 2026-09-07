'use client';

import { updateChangeRequestStatus } from '@/app/admin/dashboard/actions';
import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CoinPageLinkAction, ConfirmAction } from './admin-actions';
import { AdminPanel } from './admin-panel';
import { ActionGroup, StatusPill } from './admin-primitives';
import type { AdminChangeRequestRow, AdminTablePagination, PopoverController } from '../types';
import { labelize } from '../utils';

const emptyTableMessage = 'There is currently no items available to display.';

export function ChangeRequestsTable({
  rows,
  popover,
  pagination,
  searchQuery,
  isPending,
  onPageChange,
  onSearchChange,
}: {
  rows: AdminChangeRequestRow[];
  popover: PopoverController;
  pagination?: AdminTablePagination | null;
  searchQuery?: string;
  isPending?: boolean;
  onPageChange?: (page: number) => void;
  onSearchChange?: (query: string) => void;
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
        pagination={pagination}
        searchQuery={searchQuery}
        isPending={isPending}
        onPageChange={onPageChange}
        onSearchChange={onSearchChange}
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
                    <span className="admin-row-subtext">{row.coinSymbol || `#${row.coinId}`}</span>
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
