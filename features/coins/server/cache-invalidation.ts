import 'server-only';

import { bumpCacheVersion } from '@/lib/cache/cache-version';

export async function invalidateCoinDiscoveryCache(coinId?: number | null) {
  void coinId;
  await bumpCacheVersion(
    'topbar-summary',
    'public-coins',
    'leaderboard',
    'promoted-coins',
    'coin-interactions',
    'public-watchlists',
  );
}

export async function invalidateCoinVoteCache(coinId?: number | null) {
  void coinId;
  await bumpCacheVersion('topbar-summary', 'leaderboard', 'coin-interactions');
}

export async function invalidateCoinWatchlistCache(coinId?: number | null) {
  void coinId;
  await bumpCacheVersion('topbar-summary', 'leaderboard', 'coin-interactions', 'public-watchlists');
}

export async function invalidateCoinInteractionCache(coinId?: number | null) {
  await invalidateCoinWatchlistCache(coinId);
}
