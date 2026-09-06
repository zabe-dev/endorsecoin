'use client';

/* eslint-disable @next/next/no-img-element -- Airdrop rows reuse approved project logos from stored coin records. */
import { TablePagination, type TablePaginationState } from '@/components/ui/table-pagination';
import type { PublicAirdropRow } from '@/features/airdrops/types';
import { TableScroller } from '@/features/coins/components';
import { Icon as IconifyIcon } from '@iconify/react';
import { useRouter } from 'next/navigation';
import type { KeyboardEvent, MouseEvent } from 'react';

type AirdropLink = {
  key: string;
  label: string;
  url: string;
  icon: string;
};

export function AirdropTable({
  rows,
  pageStart,
  pagination,
}: {
  rows: PublicAirdropRow[];
  pageStart: number;
  pagination: TablePaginationState;
}) {
  const router = useRouter();

  function openCoin(coinId: number) {
    router.push(`/coin/${coinId}`);
  }

  function openCoinFromKeyboard(event: KeyboardEvent<HTMLTableRowElement>, coinId: number) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openCoin(coinId);
  }

  function keepActionClick(event: MouseEvent<HTMLAnchorElement>) {
    event.stopPropagation();
  }

  return (
    <>
      <TableScroller className="airdrops-table-frame">
        <table className="coins-table airdrops-table compact">
          <colgroup>
            <col className="airdrop-col-rank" />
            <col className="airdrop-col-name" />
            <col className="airdrop-col-timeline" />
            <col className="airdrop-col-rewards" />
            <col className="airdrop-col-start-date" />
            <col className="airdrop-col-end-date" />
            <col className="airdrop-col-website" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Airdrop</th>
              <th>Timeline</th>
              <th>Rewards</th>
              <th>START DATE</th>
              <th>END DATE</th>
              <th>Website</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((airdrop, index) => {
              const timeline = getAirdropTimeline(airdrop.startsAt, airdrop.endsAt);

              return (
                <tr
                  className="airdrop-clickable-row"
                  key={airdrop.id}
                  tabIndex={0}
                  aria-label={`Open ${airdrop.projectName} coin page`}
                  onClick={() => openCoin(airdrop.coinId)}
                  onKeyDown={(event) => openCoinFromKeyboard(event, airdrop.coinId)}
                >
                  <td>
                    <span className="airdrop-row-number">{pageStart + index + 1}</span>
                  </td>
                  <td>
                    <div className="airdrop-name-cell">
                      <span>
                        {airdrop.projectLogoUrl ? (
                          <img
                            src={airdrop.projectLogoUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          airdrop.projectName.slice(0, 1)
                        )}
                      </span>
                      <div>
                        <span className="airdrop-title">{airdrop.name}</span>
                        <small>
                          {airdrop.projectName}
                          {airdrop.projectSymbol ? ` · ${airdrop.projectSymbol}` : ''}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="airdrop-timeline-cell">
                      <span className="airdrop-timeline-head">
                        <span className={`airdrop-status-text ${timeline.state}`}>
                          {timeline.label}
                        </span>
                        {timeline.caption && <small>{timeline.caption}</small>}
                      </span>
                      <span
                        className={`airdrop-timeline-track ${timeline.state}`}
                        aria-label={`${timeline.label}${timeline.caption ? `, ${timeline.caption}` : ''}`}
                      >
                        <span style={{ width: `${timeline.progress}%` }} />
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="airdrop-reward-cell">
                      <span className="airdrop-reward-copy">{airdrop.rewards}</span>
                      <small className="airdrop-winner-copy">
                        {airdrop.winnersCount.toLocaleString()} winners
                      </small>
                    </span>
                  </td>
                  <td>
                    <span className="airdrop-date">{formatAirdropDate(airdrop.startsAt)}</span>
                  </td>
                  <td>
                    <span className="airdrop-date">{formatAirdropDate(airdrop.endsAt)}</span>
                  </td>
                  <td>
                    <div className="airdrop-action-group">
                      {getAirdropLinks(airdrop).map((link) => (
                        <a
                          className="airdrop-action-btn"
                          href={link.url}
                          key={link.key}
                          target="_blank"
                          rel="noreferrer"
                          title={link.label}
                          aria-label={`${link.label} for ${airdrop.name}`}
                          onClick={keepActionClick}
                        >
                          <IconifyIcon icon={link.icon} aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroller>
      <TablePagination className="airdrops-pagination" pagination={pagination} />
    </>
  );
}

function getAirdropLinks(airdrop: PublicAirdropRow): AirdropLink[] {
  const links: AirdropLink[] = [];

  addAirdropLink(links, {
    key: 'claim',
    label: 'Claim rewards',
    url: airdrop.claimRewardsUrl,
    icon: 'lucide:gift',
  });
  addAirdropLink(links, {
    key: 'website',
    label: 'Website',
    url: airdrop.website,
    icon: 'akar-icons:link-chain',
  });

  return links;
}

function addAirdropLink(links: AirdropLink[], link: AirdropLink) {
  const url = link.url.trim();
  if (!url) return;
  links.push({ ...link, url });
}

function getAirdropTimeline(startsAt: string, endsAt: string) {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const duration = Math.max(end - start, 1);

  if (now < start) {
    return {
      state: 'scheduled',
      label: 'Scheduled',
      caption: `in ${formatRelativeDuration(start - now)}`,
      progress: 0,
    };
  }

  if (now >= end) {
    return {
      state: 'ended',
      label: 'Ended',
      caption: '',
      progress: 100,
    };
  }

  return {
    state: 'ongoing',
    label: 'Ongoing',
    caption: `${formatRelativeDuration(end - now)} left`,
    progress: Math.min(100, Math.max(5, Math.round(((now - start) / duration) * 100))),
  };
}

function formatRelativeDuration(milliseconds: number) {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;

  return `${Math.round(hours / 24)}d`;
}

function formatAirdropDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
