import type { Coin } from '@/features/coins/types';
import type { CoinListItem } from '@/features/coins/view';

export type ChartRange = '1H' | '4H' | '24H' | '7D' | '30D';

export type ChartPoint = { timestamp: number; price: number };

export type CoinDetailView = CoinListItem;

export type CanonicalCoin = Coin;
