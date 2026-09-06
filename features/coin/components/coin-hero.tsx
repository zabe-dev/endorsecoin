'use client';
/* eslint-disable @next/next/no-img-element -- Project logos can come from submitted URLs later. */

import { BoltIcon } from '@/features/coins/components';
import { FormattedPrice } from '@/features/coins/components/formatted-price';
import { getNetworkConfig } from '@/features/coins/networks';
import { Icon as IconifyIcon } from '@iconify/react';
import { Check, Copy } from 'lucide-react';
import type { CoinDetailView } from '../types';
import { CoinSocialActions } from './coin-social-actions';

function shortenContract(address: string) {
  if (!address || address === '—') return '—';
  if (address.length <= 18) return address;

  return `${address.slice(0, 10)}......${address.slice(-6)}`;
}

function formatPresaleDateTime(value: string | null) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
    .format(new Date(value))
    .replace(/\//g, '-')
    .replace(',', '');
}

export function CoinHero({
  coin,
  contractAddress,
  contractCopied,
  onCopyContract,
  onShare,
  onReport,
}: {
  coin: CoinDetailView;
  contractAddress: string;
  contractCopied: boolean;
  onCopyContract: () => void;
  onShare: () => void;
  onReport: () => void;
}) {
  const hasContract = Boolean(coin.contractAddress && contractAddress && contractAddress !== '—');
  const explorerUrl = hasContract
    ? getNetworkConfig(coin.network).explorerAddressUrl?.(contractAddress)
    : null;

  return (
    <section className="container coin-hero">
      <div className="coin-heading-main">
        <div className="coin-identity">
          <div className={`detail-logo ${coin.color}`}>
            {coin.image ? <img src={coin.image} alt="" /> : coin.logo}
          </div>
          <div className="coin-title-copy">
            <div className="coin-name-line">
              <h1
                className={coin.boost === 500 ? 'gold-name gold-name-animated' : ''}
                title={coin.name}
              >
                {coin.name}
              </h1>
              {coin.boost && (
                <span className={`boost-badge boost-${coin.boost}`}>
                  <BoltIcon />
                  {coin.boost}×
                </span>
              )}
            </div>
            <div className="coin-meta-row">
              <span className="coin-symbol">{coin.symbol}</span>
              <span className="coin-meta-chain">
                <ChainIcon coin={coin} />
                {coin.networkName}
              </span>
              <span>{coin.category}</span>
            </div>
          </div>
        </div>
        <div
          className={`coin-heading-trade ${
            coin.lifecycle === 'presale' ? 'coin-heading-trade-presale' : ''
          }`}
        >
          <div className="coin-hero-stat contract-stat">
            <span className="contract-box-label">Contract address</span>
            <button
              className="contract-box"
              type="button"
              onClick={onCopyContract}
              disabled={!hasContract}
              title={hasContract ? `Copy ${contractAddress}` : 'No contract address available'}
            >
              <span className="contract-box-value">
                <ChainIcon coin={coin} />
                <code>{shortenContract(contractAddress)}</code>
                {hasContract &&
                  (contractCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />)}
              </span>
            </button>
          </div>
          <SecurityChip label="KYC" icon="bi:person-check" url={coin.security.kycUrl} />
          <SecurityChip label="Audit" icon="bi:shield-check" url={coin.security.auditUrl} />
          {coin.lifecycle === 'presale' ? (
            <PresaleSchedule
              startDate={formatPresaleDateTime(coin.presaleStartTimestamp)}
              endDate={formatPresaleDateTime(coin.presaleEndTimestamp)}
            />
          ) : (
            <div className="coin-hero-stat coin-price-block">
              <small>PRICE USD</small>
              <div>
                <strong>
                  <FormattedPrice value={coin.price} />
                </strong>
                {coin.price !== '—' && (
                  <span className={coin.change >= 0 ? 'positive' : 'negative'}>
                    {coin.change >= 0 ? '+' : ''}
                    {coin.change}%
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="coin-heading-actions">
        <CoinSocialActions
          links={coin.links}
          explorerUrl={explorerUrl}
          onShare={onShare}
          onReport={onReport}
        />
      </div>
    </section>
  );
}

function SecurityChip({
  label,
  icon,
  url,
}: {
  label: 'KYC' | 'Audit';
  icon: string;
  url: string | null;
}) {
  const valueLabel = url ? label.toUpperCase() : `NO ${label.toUpperCase()}`;
  const boxContent = (
    <b>
      <i>
        <IconifyIcon icon={icon} aria-hidden="true" />
      </i>
      {valueLabel}
    </b>
  );

  return (
    <span className={`coin-security-chip ${url ? '' : 'muted'}`}>
      <span>{label}</span>
      {url ? (
        <a className="coin-security-chip-box" href={url} target="_blank" rel="noreferrer">
          {boxContent}
        </a>
      ) : (
        <span className="coin-security-chip-box" aria-disabled="true">
          {boxContent}
        </span>
      )}
    </span>
  );
}

function PresaleSchedule({ startDate, endDate }: { startDate: string; endDate: string }) {
  return (
    <div className="coin-hero-stat coin-presale-schedule">
      <DateStat label="Presale start" value={startDate} />
      <DateStat label="Presale end" value={endDate} />
    </div>
  );
}

function DateStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="coin-date-block">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

function ChainIcon({ coin }: { coin: CoinDetailView }) {
  return (
    <span className="contract-chain-icon" title={coin.networkName}>
      {coin.chainIcon ? <img src={coin.chainIcon} alt="" /> : coin.chain[0]}
    </span>
  );
}
