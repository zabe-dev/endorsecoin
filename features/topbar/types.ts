export type TopbarPriceTicker = {
  symbol: 'BTC' | 'ETH' | 'SOL' | 'BNB';
  price: number | null;
  change: number | null;
};

export type TopbarCoinLink = {
  id: number;
  name: string;
  symbol: string;
  logoUrl: string | null;
  boost: number | null;
} | null;

export type TopbarSummary = {
  prices: TopbarPriceTicker[];
  users: number | null;
  projects: number | null;
  totalVotes: number | null;
  trendingCoin: TopbarCoinLink;
  topVotedCoin: TopbarCoinLink;
};
