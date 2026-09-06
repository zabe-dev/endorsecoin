'use client';

/* eslint-disable @next/next/no-img-element -- Airdrop cards reuse approved project logos from stored coin records. */
import { TablePagination, type TablePaginationState } from '@/components/ui/table-pagination';
import type { PublicAirdropRow } from '@/features/airdrops/types';
import { Icon as IconifyIcon } from '@iconify/react';
import { useRouter } from 'next/navigation';
import type { KeyboardEvent, MouseEvent } from 'react';

type AirdropLink = {
  key: string;
  label: string;
  url?: string;
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

  function openCoinFromKeyboard(event: KeyboardEvent<HTMLElement>, coinId: number) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openCoin(coinId);
  }

  function keepActionClick(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  return (
    <>
      <div className="airdrops-card-grid">
        {rows.map((airdrop, index) => {
          const status = getAirdropStatus(airdrop.startsAt, airdrop.endsAt);
          const progress = getAirdropProgress(airdrop.startsAt, airdrop.endsAt);
          const primaryLinks = getPrimaryAirdropLinks(airdrop);
          const socialLinks = getAirdropSocialLinks(airdrop);
          const claimLink = primaryLinks.find((link) => link.key === 'claim');
          const websiteLink = primaryLinks.find((link) => link.key === 'website');

          return (
            <article
              className="airdrop-card"
              key={airdrop.id}
              tabIndex={0}
              aria-label={`Open ${airdrop.projectName} coin page`}
              onClick={() => openCoin(airdrop.coinId)}
              onKeyDown={(event) => openCoinFromKeyboard(event, airdrop.coinId)}
            >
              <div className="airdrop-card-topline">
                <span className="airdrop-card-number">#{pageStart + index + 1}</span>
                <span className={`airdrop-status-label ${status}`}>
                  {formatAirdropStatus(status)}
                </span>
              </div>

              <div className="airdrop-card-project">
                <span className="airdrop-logo-mark">
                  {airdrop.projectLogoUrl ? (
                    <img src={airdrop.projectLogoUrl} alt="" loading="lazy" decoding="async" />
                  ) : (
                    airdrop.projectName.slice(0, 1)
                  )}
                </span>
                <div>
                  <span className="airdrop-project-name">{airdrop.projectName}</span>
                  <small>{airdrop.projectSymbol || 'Project'}</small>
                </div>
              </div>

              <div className="airdrop-card-body">
                <h2>{airdrop.name}</h2>
                <p>{airdrop.rewards}</p>
              </div>

              <div className="airdrop-card-stats">
                <div>
                  <span>{airdrop.winnersCount.toLocaleString()}</span>
                  <small>Winners</small>
                </div>
                <div>
                  <span>{formatShortDate(airdrop.endsAt)}</span>
                  <small>Ends</small>
                </div>
              </div>

              <div className="airdrop-card-dates" aria-label="Airdrop schedule">
                <span>{formatAirdropDate(airdrop.startsAt)}</span>
                <span>{formatAirdropDate(airdrop.endsAt)}</span>
              </div>

              <div className="airdrop-card-timeline" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>

              <div className="airdrop-card-footer">
                {claimLink ? (
                  <a
                    className="airdrop-claim-link"
                    href={claimLink.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={keepActionClick}
                  >
                    Claim
                    <IconifyIcon icon={claimLink.icon} aria-hidden="true" />
                  </a>
                ) : (
                  <span className="airdrop-claim-placeholder">View details</span>
                )}
                <div className="airdrop-action-group">
                  {websiteLink ? (
                    <a
                      className="airdrop-action-btn"
                      href={websiteLink.url}
                      target="_blank"
                      rel="noreferrer"
                      title={websiteLink.label}
                      aria-label={`${websiteLink.label} for ${airdrop.name}`}
                      onClick={keepActionClick}
                    >
                      <IconifyIcon icon={websiteLink.icon} aria-hidden="true" />
                    </a>
                  ) : null}
                  {socialLinks.length ? (
                    <details className="airdrop-links-menu" onClick={keepActionClick}>
                      <summary aria-label={`Show social links for ${airdrop.name}`}>
                        <IconifyIcon icon="lucide:ellipsis" aria-hidden="true" />
                      </summary>
                      <div className="airdrop-links-popover">
                        {socialLinks.map((link) => (
                          <a
                            href={link.url}
                            key={link.key}
                            target="_blank"
                            rel="noreferrer"
                            title={link.label}
                            aria-label={`${link.label} for ${airdrop.name}`}
                          >
                            <IconifyIcon icon={link.icon} aria-hidden="true" />
                            <span>{link.label}</span>
                          </a>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <TablePagination className="airdrops-pagination" pagination={pagination} />
    </>
  );
}

function getPrimaryAirdropLinks(airdrop: PublicAirdropRow): AirdropLink[] {
  const links: AirdropLink[] = [];

  addAirdropLink(links, {
    key: 'website',
    label: 'Website',
    url: airdrop.website,
    icon: 'akar-icons:link-chain',
  });
  addAirdropLink(links, {
    key: 'claim',
    label: 'Claim rewards',
    url: airdrop.claimRewardsUrl,
    icon: 'lucide:gift',
  });

  return links;
}

function getAirdropSocialLinks(airdrop: PublicAirdropRow): AirdropLink[] {
  const links: AirdropLink[] = [];

  addAirdropLink(links, {
    key: 'telegram',
    label: 'Telegram',
    url: airdrop.socialLinks.telegram,
    icon: 'akar-icons:telegram-fill',
  });
  addAirdropLink(links, {
    key: 'x',
    label: 'X',
    url: airdrop.socialLinks.x,
    icon: 'akar-icons:x-fill',
  });
  addAirdropLink(links, {
    key: 'reddit',
    label: 'Reddit',
    url: airdrop.socialLinks.reddit,
    icon: 'akar-icons:reddit-fill',
  });
  addAirdropLink(links, {
    key: 'discord',
    label: 'Discord',
    url: airdrop.socialLinks.discord,
    icon: 'akar-icons:discord-fill',
  });
  addAirdropLink(links, {
    key: 'youtube',
    label: 'YouTube',
    url: airdrop.socialLinks.youtube,
    icon: 'akar-icons:youtube-fill',
  });
  addAirdropLink(links, {
    key: 'facebook',
    label: 'Facebook',
    url: airdrop.socialLinks.facebook,
    icon: 'akar-icons:facebook-fill',
  });

  return links;
}

function addAirdropLink(links: AirdropLink[], link: AirdropLink) {
  const url = link.url?.trim();
  if (!url) return;
  links.push({ ...link, url });
}

function getAirdropStatus(startsAt: string, endsAt: string) {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  if (now < start) return 'scheduled';
  if (now >= end) return 'ended';
  return 'ongoing';
}

function getAirdropProgress(startsAt: string, endsAt: string) {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  if (now <= start) return 0;
  if (now >= end) return 100;

  return Math.max(4, Math.min(96, Math.round(((now - start) / (end - start)) * 100)));
}

function formatAirdropStatus(status: string) {
  if (status === 'ongoing') return 'Live';
  if (status === 'scheduled') return 'Scheduled';
  return 'Ended';
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatAirdropDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
