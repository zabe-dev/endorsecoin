import type { LeaderboardPage } from '@/features/coins/leaderboard-types';
import type { CoinListItem } from '@/features/coins/view';

export type DiscoveryHotspots = {
  recent: CoinListItem[];
  trending: CoinListItem[];
  presales: CoinListItem[];
  watched: CoinListItem[];
};

export type DiscoveryData = {
  hotspots: DiscoveryHotspots;
  promotedCoins: CoinListItem[];
  leaderboard: LeaderboardPage;
};
