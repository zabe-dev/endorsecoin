import 'server-only';

import { randomUUID } from 'crypto';
import { getReadyRedisClient } from './redis';

type RedisLockOptions<T> = {
  key: string;
  ttlMs: number;
  onLocked: () => T | Promise<T>;
  runWithoutRedis?: boolean;
};

const releaseLockScript = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

export async function withRedisLock<T>(
  options: RedisLockOptions<T>,
  run: () => Promise<T>,
): Promise<T> {
  const redis = await getReadyRedisClient();

  if (!redis) {
    if (options.runWithoutRedis === false) return options.onLocked();
    return run();
  }

  const token = randomUUID();
  const acquired = await redis.set(options.key, token, 'PX', options.ttlMs, 'NX');

  if (acquired !== 'OK') return options.onLocked();

  try {
    return await run();
  } finally {
    await redis.eval(releaseLockScript, 1, options.key, token).catch(() => undefined);
  }
}
