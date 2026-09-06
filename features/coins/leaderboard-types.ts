import type { CoinListItem, CoinSortKey } from '@/features/coins/view';

export type LeaderboardView = 'top' | 'trending' | 'presales' | 'watched' | 'recent';

export type LeaderboardQuery = {
  view?: string | null;
  category?: string | null;
  chain?: string | null;
  search?: string | null;
  sort?: string | null;
  direction?: string | null;
  page?: string | number | null;
  pageSize?: string | number | null;
  userId?: string | null;
};

export type LeaderboardPage = {
  rows: CoinListItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  view: LeaderboardView;
  category: string;
  chain: string;
  search: string;
  sort: {
    key: CoinSortKey;
    direction: 'asc' | 'desc';
  };
};

export type LeaderboardSelection = Omit<LeaderboardPage, 'rows'> & {
  ids: number[];
};
