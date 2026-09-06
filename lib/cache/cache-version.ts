import 'server-only';

import { cacheKeyPart } from './cache-key';
import { getReadyRedisClient } from './redis';

const defaultCacheVersion = 1;

export async function getCacheVersion(scope: string) {
  try {
    const redis = await getReadyRedisClient();
    if (!redis) return defaultCacheVersion;

    const value = await redis.get(cacheVersionKey(scope));
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : defaultCacheVersion;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[redis-cache] version read skipped:',
        error instanceof Error ? error.message : error,
      );
    }

    return defaultCacheVersion;
  }
}

export async function bumpCacheVersion(...scopes: string[]) {
  const uniqueScopes = Array.from(new Set(scopes.filter(Boolean)));
  if (!uniqueScopes.length) return;

  try {
    const redis = await getReadyRedisClient();
    if (!redis) return;

    await Promise.all(uniqueScopes.map((scope) => redis.incr(cacheVersionKey(scope))));
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[redis-cache] BUMP ${uniqueScopes.join(',')}`);
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[redis-cache] version bump skipped:',
        error instanceof Error ? error.message : error,
      );
    }
  }
}

export function cacheVersionKey(scope: string) {
  return `cache-version:${cacheKeyPart(scope)}`;
}
