import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;
const shouldFlushAll = process.argv.includes('--all');

if (!redisUrl) {
  console.error('REDIS_URL is not set.');
  process.exit(1);
}

const redis = new Redis(redisUrl, {
  connectTimeout: 3000,
  enableOfflineQueue: false,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});

try {
  await redis.connect();
  if (shouldFlushAll) {
    await redis.flushall();
    console.log('Redis FLUSHALL completed.');
  } else {
    await redis.flushdb();
    console.log('Redis FLUSHDB completed for the configured REDIS_URL database.');
  }
} catch (error) {
  console.error('Redis flush failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
