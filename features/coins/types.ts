export type CoinId = number;

/** UUID string used for private or sensitive records; never expose sequential IDs for these. */
export type PrivateRecordId = string;

export type NetworkId =
  | 'ethereum'
  | 'bsc'
  | 'solana'
  | 'polygon'
  | 'avalanche'
  | 'arbitrum'
  | 'base'
  | 'optimism'
  | 'dogecoin'
  | 'tron'
  | 'fantom'
  | 'kcc'
  | 'sui'
  | 'hood'
  | 'xrpl'
  | 'other';

export type CoinCategory =
  | 'AI'
  | 'DeFi'
  | 'Fan Token'
  | 'Gambling'
  | 'Gaming'
  | 'Memecoins'
  | 'NFT Platform'
  | 'Other'
  | 'Play To Earn'
  | 'Pump.fun Tokens'
  | 'Utility Token';

export type ChartConfig =
  | { source: 'market'; externalId: string }
  | { source: 'dex'; network: NetworkId; poolAddress: string }
  | {
      source: 'embed';
      provider: 'dexscreener' | 'geckoterminal' | 'dextools' | 'coinbrain';
      url: string;
    }
  | { source: 'external'; url: string }
  | { source: 'unavailable' };

export type DexConfig =
  | {
      available: true;
      provider:
        | 'dexscreener'
        | 'geckoterminal'
        | 'uniswap'
        | 'pancakeswap'
        | 'raydium'
        | 'quickswap'
        | 'mojitoswap'
        | 'cetus'
        | 'custom';
      url: string;
      pairAddress?: string;
    }
  | { available: false };

export type CoinProjectLink = {
  type: 'website' | 'telegram' | 'x' | 'discord' | 'github' | 'whitepaper';
  url: string;
};

export type CoinSecurityLinks = {
  kycUrl: string | null;
  auditUrl: string | null;
};

export type CoinPresaleDetails = {
  websiteUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  paymentToken: string | null;
  softCap: string | null;
  hardCap: string | null;
};

export type BoostMultiplier = 10 | 30 | 50 | 100 | 500;

export type BoostState =
  | { active: false }
  | {
      active: true;
      multiplier: BoostMultiplier;
      startsAt: string;
      endsAt: string;
    };

export type PromotedState =
  | { active: false }
  | {
      active: true;
      startsAt: string;
      endsAt: string;
      placement: 'promoted-table';
      priority: number;
    };

export type CoinMarketData = {
  priceUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  change24h: number | null;
  liquidityUsd: number | null;
  fdvUsd: number | null;
  totalSupply: number | null;
  holdersCount: number | null;
  marketRank: number | null;
  lastUpdatedAt: string | null;
};

export type CoinCommunityData = {
  weeklyVotes: number;
  totalVotes: number;
  recentVotes: number;
  recentWatchlistAdds: number;
  trendingScore: number;
  watchlistCount: number;
  userHasVoted?: boolean;
  nextVoteAt?: string | null;
  userWatching?: boolean;
};

export type Coin = {
  id: CoinId;
  externalId: string;
  name: string;
  symbol: string;
  slug: string;
  assetType: 'token';
  lifecycle: 'launched' | 'presale';
  listingStatus: string;
  network: NetworkId;
  contractAddress: string;
  logoUrl: string | null;
  description: string | null;
  category: CoinCategory;
  launchDate: string | null;
  presaleStartDate: string | null;
  presaleEndDate: string | null;
  submittedAt: string;
  populatedAt: string;
  chart: ChartConfig;
  dex: DexConfig;
  links: CoinProjectLink[];
  security: CoinSecurityLinks;
  presale: CoinPresaleDetails;
  boost: BoostState;
  promoted: PromotedState;
  market: CoinMarketData;
  community: CoinCommunityData;
};

export function isCoinId(value: unknown): value is CoinId {
  return Number.isSafeInteger(value) && Number(value) >= 1000;
}
