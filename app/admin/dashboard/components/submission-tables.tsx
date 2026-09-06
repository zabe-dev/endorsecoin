'use client';

import { updateAdminAirdropSubmission, updateAdminSubmission } from '@/app/admin/dashboard/actions';
import { Check, Eye, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConfirmAction, LogoUrlAction } from './admin-actions';
import { AdminPanel } from './admin-panel';
import { ActionGroup, StatusPill } from './admin-primitives';
import type { AdminSubmissionRow, AdminTablePagination, PopoverController } from '../types';
import { labelize } from '../utils';

const emptyTableMessage = 'There is currently no items available to display.';

export function PendingSubmissionsTable({
  rows,
  popover,
  title,
  note,
  searchPlaceholder,
  pagination,
  searchQuery,
  isPending,
  onPageChange,
  onSearchChange,
}: {
  rows: AdminSubmissionRow[];
  popover: PopoverController;
  title: string;
  note: string;
  searchPlaceholder: string;
  pagination?: AdminTablePagination | null;
  searchQuery?: string;
  isPending?: boolean;
  onPageChange?: (page: number) => void;
  onSearchChange?: (query: string) => void;
}) {
  const [detailRow, setDetailRow] = useState<AdminSubmissionRow | null>(null);

  return (
    <>
      <AdminPanel
        eyebrow="Review queue"
        title={title}
        count={`${rows.length} pending`}
        note={note}
        rows={rows}
        searchPlaceholder={searchPlaceholder}
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

export function PendingAirdropsTable({
  rows,
  popover,
  pagination,
  searchQuery,
  isPending,
  onPageChange,
  onSearchChange,
}: {
  rows: AdminSubmissionRow[];
  popover: PopoverController;
  pagination?: AdminTablePagination | null;
  searchQuery?: string;
  isPending?: boolean;
  onPageChange?: (page: number) => void;
  onSearchChange?: (query: string) => void;
}) {
  const [detailRow, setDetailRow] = useState<AdminSubmissionRow | null>(null);

  return (
    <>
      <AdminPanel
        eyebrow="Review queue"
        title="Pending airdrops"
        count={`${rows.length} pending`}
        note="Airdrop campaigns waiting for approval. Approved airdrops appear on the public airdrops page."
        rows={rows}
        searchPlaceholder="Search airdrop, project, or contact"
        search={(row) => [row.name, row.symbol, row.chain, row.contactEmail, row.contactTelegram]}
        empty={emptyTableMessage}
        pagination={pagination}
        searchQuery={searchQuery}
        isPending={isPending}
        onPageChange={onPageChange}
        onSearchChange={onSearchChange}
        renderTable={(visibleRows) => (
          <table className="admin-table admin-airdrops-table">
            <thead>
              <tr>
                <th>Logo</th>
                <th>Airdrop</th>
                <th>Project</th>
                <th>Symbol</th>
                <th>Submitted By</th>
                <th>Contact Email</th>
                <th>Date Submitted</th>
                <th>Status</th>
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
                  <td>{row.chain || '—'}</td>
                  <td>{row.symbol ? `$${row.symbol}` : '—'}</td>
                  <td>{row.submittedBy || '—'}</td>
                  <td>{row.contactEmail || '—'}</td>
                  <td>{row.submittedAt}</td>
                  <td>
                    <StatusPill tone={row.status === 'pending' ? 'warning' : 'neutral'}>
                      {labelize(row.status)}
                    </StatusPill>
                  </td>
                  <td>
                    <ActionGroup>
                      <button
                        type="button"
                        className="admin-icon-button neutral"
                        title="View full airdrop"
                        aria-label={`View full airdrop for ${row.name}`}
                        onClick={() => {
                          popover.setActivePopoverId(null);
                          setDetailRow(row);
                        }}
                      >
                        <Eye aria-hidden="true" />
                      </button>
                      <ConfirmAction
                        popover={popover}
                        popoverId={`airdrop-approve-${row.id}`}
                        action={updateAdminAirdropSubmission}
                        title="Approve airdrop"
                        tone="success"
                        message={`Approve ${row.name}? This will make it eligible for the public airdrops page.`}
                        fields={{
                          airdropSubmissionId: row.id,
                          status: 'approved',
                        }}
                      >
                        <Check aria-hidden="true" />
                      </ConfirmAction>
                      <ConfirmAction
                        popover={popover}
                        popoverId={`airdrop-reject-${row.id}`}
                        action={updateAdminAirdropSubmission}
                        title="Reject airdrop"
                        tone="danger"
                        message={`Reject ${row.name}? Add the reason so the review trail is clear.`}
                        fields={{
                          airdropSubmissionId: row.id,
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
              {row.submissionKind === 'airdrop'
                ? 'Airdrop'
                : row.symbol
                  ? `$${row.symbol}`
                  : 'No symbol'}{' '}
              · {row.chain || 'No project'} · {row.submittedAt}
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
