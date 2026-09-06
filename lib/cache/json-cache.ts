import 'server-only';

import { getReadyRedisClient } from './redis';

type CacheOptions = {
  ttlSeconds: number;
};

export async function rememberJson<T>(
  key: string,
  options: CacheOptions,
  loader: () => Promise<T>,
): Promise<T> {
  const cachedValue = await readJson<T>(key);
  if (cachedValue.hit) {
    logCache('HIT', key);
    return cachedValue.value;
  }

  logCache('MISS', key);
  const value = await loader();
  void writeJson(key, value, options.ttlSeconds);

  return value;
}

export async function incrementCacheCounter(key: string, ttlSeconds: number) {
  try {
    const redis = await getReadyRedisClient();
    if (!redis) return null;

    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, ttlSeconds);

    return count;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[redis-cache] counter skipped:',
        error instanceof Error ? error.message : error,
      );
    }

    return null;
  }
}

async function readJson<T>(key: string): Promise<{ hit: true; value: T } | { hit: false }> {
  try {
    const redis = await getReadyRedisClient();
    if (!redis) {
      logCache('SKIP', key);
      return { hit: false };
    }

    const rawValue = await redis.get(key);
    if (!rawValue) return { hit: false };

    return { hit: true, value: JSON.parse(rawValue) as T };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[redis-cache] read skipped:', error instanceof Error ? error.message : error);
    }

    return { hit: false };
  }
}

async function writeJson(key: string, value: unknown, ttlSeconds: number) {
  try {
    const redis = await getReadyRedisClient();
    if (!redis) return;

    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    logCache('WRITE', `${key} (${ttlSeconds}s)`);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[redis-cache] write skipped:', error instanceof Error ? error.message : error);
    }
  }
}

function logCache(event: 'HIT' | 'MISS' | 'SKIP' | 'WRITE', message: string) {
  if (process.env.NODE_ENV === 'production') return;
  console.info(`[redis-cache] ${event} ${readableCacheLog(message)}`);
}

function readableCacheLog(message: string) {
  return message
    .split(':')
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join(':');
}
