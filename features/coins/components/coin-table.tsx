'use client';
/* eslint-disable @next/next/no-img-element -- Project logos can come from submitted URLs later. */

import { VoteButton, WatchlistButton } from '@/components/ui/action-buttons';
import {
  formatVotes,
  type CoinListItem as Coin,
  type CoinSortKey as SortKey,
} from '@/features/coins/view';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { FormattedPrice } from './formatted-price';
import { BoltIcon } from './icons';
import { TableScroller } from './table-scroller';

export function SortHeader({
  l,
  k,
  s,
  go,
}: {
  l: string;
  k: SortKey;
  s: { key: SortKey; dir: 1 | -1 };
  go: (key: SortKey) => void;
}) {
  return (
    <th>
      <button className="sort-head" onClick={() => go(k)}>
        {l}
        <span>{s.key === k ? (s.dir === 1 ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

export function CoinCells({ coin, linkEnabled = true }: { coin: Coin; linkEnabled?: boolean }) {
  const nameClass = coin.boost === 500 ? 'gold-name gold-name-animated' : '';

  return (
    <>
      <td>
        <span className={`rank-number ${coin.rank < 4 ? 'top' : ''}`}>{coin.rank}</span>
      </td>
      <td>
        <div className="coin-cell">
          <div className={`coin-logo ${coin.color}`}>
            {coin.image ? <img src={coin.image} alt="" /> : coin.logo}
            <span className="chain-badge" title={coin.networkName}>
              {coin.chainIcon ? <img src={coin.chainIcon} alt="" /> : coin.chain[0]}
            </span>
          </div>
          <div>
            {linkEnabled ? (
              <Link
                href={`/coin/${coin.coinId}`}
                className={nameClass}
                title={coin.name}
                aria-label={coin.name}
              >
                <b>{coin.name}</b>
              </Link>
            ) : (
              <span className={`coin-name-static ${nameClass}`} title={coin.name}>
                <b>{coin.name}</b>
              </span>
            )}
            <span>
              {coin.promoted
                ? `$${coin.symbol} · ${coin.networkName}`
                : `${coin.symbol} · ${coin.category}`}
            </span>
          </div>
        </div>
      </td>
      <td className="numeric">{coin.cap}</td>
      <td className="numeric">
        <FormattedPrice value={coin.price} />
      </td>
      <td>
        <span className={coin.change >= 0 ? 'positive' : 'negative'}>
          {coin.change >= 0 ? '+' : ''}
          {coin.change}%
        </span>
      </td>
      <td className="muted-cell">{coin.launch}</td>
      <td>
        {coin.boost ? (
          <span className={`boost-badge boost-${coin.boost}`}>
            <BoltIcon />
            {coin.boost}×
          </span>
        ) : (
          <span className="no-boost">—</span>
        )}
      </td>
      <td>
        <div className="vote-total">
          <b>{formatVotes(coin.votes)}</b>
          <span>this week</span>
        </div>
      </td>
      <td className="muted-cell">{coin.age}</td>
    </>
  );
}

export { ActionBurst as LineBurst } from '@/components/ui/action-buttons';

export function WatchButton({
  active,
  bursting,
  onClick,
}: {
  active: boolean;
  bursting: boolean;
  onClick: () => void;
}) {
  return <WatchlistButton active={active} animating={bursting} onClick={onClick} />;
}

export type CoinTableProps = {
  coins: Coin[];
  watchlist: number[];
  watchAnimating: number | null;
  voted: number[];
  animating: number | null;
  watch: (coinId: number) => void;
  vote: (coinId: number) => void;
  header?: ReactNode;
  className?: string;
  coinLinks?: boolean;
  emptyMessage?: string;
};

export function CoinTable({
  coins,
  watchlist,
  watchAnimating,
  voted,
  animating,
  watch,
  vote,
  header,
  className,
  coinLinks = true,
  emptyMessage,
}: CoinTableProps) {
  const router = useRouter();

  function openCoinRow(event: MouseEvent<HTMLTableRowElement>, coinId: number) {
    const target = event.target as HTMLElement;
    if (target.closest('a, button')) return;
    router.push(`/coin/${coinId}`);
  }

  return (
    <TableScroller className={className}>
      <table className="coins-table">
        <thead>
          {header ?? (
            <tr>
              <th>#</th>
              <th>Coin</th>
              <th>Market cap</th>
              <th>Price</th>
              <th>24h</th>
              <th>Launch</th>
              <th>Boost</th>
              <th>Weekly votes</th>
              <th>Submitted</th>
              <th>Watch</th>
              <th />
            </tr>
          )}
        </thead>
        <tbody>
          {coins.length > 0 ? (
            coins.map((coin) => {
              const hasVoted = voted.includes(coin.coinId);
              return (
                <tr
                  key={coin.coinId}
                  className={`${coin.boost ? 'boosted-row' : ''} clickable-coin-row`}
                  onClick={(event) => openCoinRow(event, coin.coinId)}
                >
                  <CoinCells coin={coin} linkEnabled={coinLinks} />
                  <td>
                    <WatchlistButton
                      active={watchlist.includes(coin.coinId)}
                      animating={watchAnimating === coin.coinId}
                      onClick={() => watch(coin.coinId)}
                    />
                  </td>
                  <td>
                    <VoteButton
                      active={hasVoted}
                      animating={animating === coin.coinId}
                      onClick={() => vote(coin.coinId)}
                    />
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td className="coins-table-empty" colSpan={11}>
                {emptyMessage || 'There is currently no projects available to display.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TableScroller>
  );
}
