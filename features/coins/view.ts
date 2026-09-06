import { NETWORKS } from './networks';
import type { Coin, CoinCategory, NetworkId } from './types';

const logoColors = ['cyan', 'orange', 'pink', 'blue', 'green', 'yellow', 'red', 'violet'] as const;

export type CoinListItem = {
  coinId: number;
  externalId: string;
  rank: number;
  name: string;
  symbol: string;
  lifecycle: 'launched' | 'presale';
  listingStatus: string;
  chain: string;
  network: NetworkId;
  networkName: string;
  chainIcon: string | null;
  logo: string;
  image?: string;
  description: string | null;
  color: string;
  cap: string;
  capN: number;
  fdv: string;
  liquidity: string;
  volume24h: string;
  price: string;
  change: number;
  launch: string;
  launchTimestamp: string | null;
  presaleStart: string;
  presaleStartTimestamp: string | null;
  presaleEnd: string;
  presaleEndTimestamp: string | null;
  totalSupply: string;
  holders: string;
  boost?: number;
  promoted: boolean;
  rawVotes: number;
  votes: number;
  totalVotes: number;
  recentVotes: number;
  recentWatchlistAdds: number;
  trendingScore: number;
  watchCount: number;
  hasVoted: boolean;
  nextVoteAt: string | null;
  isWatching: boolean;
  age: string;
  submittedTimestamp: string;
  category: CoinCategory;
  trend: number;
  contractAddress: string;
  links: Coin['links'];
  security: Coin['security'];
  presale: Coin['presale'];
  buyUrl?: string;
};

export type CoinSortKey =
  'rank' | 'name' | 'capN' | 'price' | 'change' | 'launch' | 'boost' | 'votes' | 'age';

export const coinCategories: Array<'All' | CoinCategory> = [
  'All',
  'AI',
  'DeFi',
  'Fan Token',
  'Gambling',
  'Gaming',
  'Memecoins',
  'NFT Platform',
  'Other',
  'Play To Earn',
  'Pump.fun Tokens',
  'Utility Token',
];

export const coinChainOptions = [
  'All chains',
  ...Object.values(NETWORKS)
    .filter((network) => network.enabled)
    .map((network) => network.shortName),
];

const otherChainIconUrl = 'https://api.iconify.design/mdi:help-circle-outline.svg?color=%23a8b0bd';

export const coinChainChoices = [
  { label: 'All chains', iconUrl: null },
  ...Object.values(NETWORKS)
    .filter((network) => network.enabled)
    .map((network) => ({
      label: network.shortName,
      iconUrl: network.id === 'other' ? otherChainIconUrl : network.iconUrl,
    })),
];

export function toCoinListItem(coin: Coin, index: number): CoinListItem {
  const marketCap = coin.market.marketCapUsd ?? 0;
  const priceUsd = coin.market.priceUsd;
  const change = Number((coin.market.change24h ?? 0).toFixed(2));
  const boostPackage = coin.boost.active ? coin.boost.multiplier : null;
  const rawVotes = coin.community.weeklyVotes;
  const boostedVotes = rawVotes * getBoostVoteFactor(boostPackage);
  const marketRank =
    typeof coin.market.marketRank === 'number' && coin.market.marketRank > 0
      ? coin.market.marketRank
      : null;
  return {
    coinId: coin.id,
    externalId: coin.externalId,
    rank: marketRank ?? index + 1,
    name: coin.name,
    symbol: coin.symbol,
    lifecycle: coin.lifecycle,
    listingStatus: coin.listingStatus,
    chain: NETWORKS[coin.network].shortName,
    network: coin.network,
    networkName: NETWORKS[coin.network].name,
    chainIcon: NETWORKS[coin.network].iconUrl,
    logo: coin.symbol.slice(0, 1),
    ...(coin.logoUrl ? { image: coin.logoUrl } : {}),
    description: coin.description,
    color: coin.promoted.active ? 'yellow' : logoColors[coin.id % logoColors.length],
    cap: formatMoney(coin.market.marketCapUsd),
    capN: marketCap,
    fdv: formatMoney(coin.market.fdvUsd),
    liquidity: formatMoney(coin.market.liquidityUsd),
    volume24h: formatMoney(coin.market.volume24hUsd),
    price: formatPrice(priceUsd),
    change,
    launch:
      coin.lifecycle === 'presale'
        ? coin.presaleEndDate
          ? formatTimeUntil(coin.presaleEndDate)
          : '—'
        : coin.launchDate
          ? formatTimeAgo(coin.launchDate)
          : '—',
    launchTimestamp: coin.launchDate,
    presaleStart: coin.presaleStartDate ? formatDateTime(coin.presaleStartDate) : '—',
    presaleStartTimestamp: coin.presaleStartDate,
    presaleEnd: coin.presaleEndDate ? formatTimeUntil(coin.presaleEndDate) : '—',
    presaleEndTimestamp: coin.presaleEndDate,
    totalSupply: formatTokenAmount(coin.market.totalSupply),
    holders: formatCompactNumber(coin.market.holdersCount),
    ...(boostPackage ? { boost: boostPackage } : {}),
    promoted: coin.promoted.active,
    rawVotes,
    votes: boostedVotes,
    totalVotes: coin.community.totalVotes,
    recentVotes: coin.community.recentVotes,
    recentWatchlistAdds: coin.community.recentWatchlistAdds,
    trendingScore: coin.community.trendingScore,
    watchCount: coin.community.watchlistCount,
    hasVoted: Boolean(coin.community.userHasVoted),
    nextVoteAt: coin.community.nextVoteAt || null,
    isWatching: Boolean(coin.community.userWatching),
    age: formatTimeAgo(coin.submittedAt),
    submittedTimestamp: coin.submittedAt,
    category: coin.category,
    trend: coin.community.trendingScore,
    contractAddress: coin.contractAddress,
    links: coin.links,
    security: coin.security,
    presale: coin.presale,
    ...(coin.dex.available ? { buyUrl: coin.dex.url } : {}),
  };
}

function formatDateTime(value: string) {
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

export function getBoostVoteFactor(boostPackage: number | null | undefined) {
  if (boostPackage === 10 || boostPackage === 30) return 2;
  if (boostPackage === 50 || boostPackage === 100) return 3;
  if (boostPackage === 500) return 5;
  return 1;
}

export function formatVotes(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatMoney(value: number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactNumber(value: number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatTokenAmount(value: number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: value >= 1_000 ? 2 : 4,
  }).format(value);
}

function formatPrice(value: number | null) {
  if (value === null) return '—';
  const digits =
    value >= 1
      ? 2
      : value >= 0.01
        ? 4
        : Math.min(12, Math.max(8, countLeadingPriceZeros(value) + 4));
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: digits })}`;
}

function countLeadingPriceZeros(value: number) {
  const [, decimals = ''] = value.toFixed(12).split('.');
  const match = decimals.match(/^0*/);

  return match?.[0].length ?? 0;
}

function formatTimeAgo(value: string) {
  return formatCompactRelativeTime(Date.now() - new Date(value).getTime(), 'ago');
}

function formatTimeUntil(value: string) {
  return formatLongRelativeTime(new Date(value).getTime() - Date.now());
}

function formatCompactRelativeTime(deltaMs: number, direction: 'ago' | 'in') {
  const seconds = Math.max(0, Math.round(deltaMs / 1000));
  const prefix = direction === 'in' ? 'in ' : '';
  const suffix = direction === 'ago' ? ' ago' : '';

  if (seconds < 60) return `${prefix}${formatTimeUnit(seconds, 'second')}${suffix}`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${prefix}${formatTimeUnit(minutes, 'minute')}${suffix}`;

  const hours = Math.round(seconds / 3_600);
  if (hours < 24) return `${prefix}${formatTimeUnit(hours, 'hour')}${suffix}`;

  const days = Math.round(seconds / 86_400);
  if (days < 30) return `${prefix}${formatTimeUnit(days, 'day')}${suffix}`;

  const months = Math.round(days / 30);
  if (months < 12) return `${prefix}${formatTimeUnit(months, 'month')}${suffix}`;

  const years = Math.round(months / 12);
  return `${prefix}${formatTimeUnit(years, 'year')}${suffix}`;
}

function formatLongRelativeTime(deltaMs: number) {
  const seconds = Math.max(0, Math.round(deltaMs / 1000));
  const [value, unit] =
    seconds < 60
      ? [seconds, 'second']
      : seconds < 3_600
        ? [Math.round(seconds / 60), 'minute']
        : seconds < 86_400
          ? [Math.round(seconds / 3_600), 'hour']
          : seconds < 2_592_000
            ? [Math.round(seconds / 86_400), 'day']
            : seconds < 31_104_000
              ? [Math.round(seconds / 2_592_000), 'month']
              : [Math.round(seconds / 31_104_000), 'year'];

  return `in ${value} ${unit}${value === 1 ? '' : 's'}`;
}

function formatTimeUnit(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}
