import 'server-only';

import { readFileSync } from 'node:fs';
import { recordMetric } from '@/lib/observability/metrics';
import Redis, { type RedisOptions } from 'ioredis';

let redisClient: Redis | null | undefined;
let redisConnectPromise: Promise<Redis | null> | null = null;
let redisUnavailableUntil = 0;
let lastRedisWarningAt = 0;
let lastRedisError: string | null = null;

const redisRetryPauseMs = Number(process.env.REDIS_RETRY_PAUSE_MS || 30_000);

export function getRedisClient() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) return null;
  if (Date.now() < redisUnavailableUntil) return null;
  if (redisClient && redisClient.status !== 'end' && redisClient.status !== 'close') {
    return redisClient;
  }

  const tls = getRedisTlsOptions();
  if (tls === null) return null;

  redisConnectPromise = null;
  redisClient = new Redis(redisUrl, {
    connectTimeout: 1000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    ...(tls ? { tls } : null),
  });

  redisClient.on('error', (error) => {
    markRedisUnavailable(error.message);
  });

  return redisClient;
}

export async function getReadyRedisClient() {
  const client = getRedisClient();
  if (!client) return null;

  try {
    if (client.status === 'wait' || client.status === 'connecting' || client.status === 'connect') {
      redisConnectPromise ||= client.connect().then(
        () => {
          lastRedisError = null;
          recordMetric('redis.connection', { event: 'ready' });
          return client;
        },
        (error) => {
          markRedisUnavailable(error instanceof Error ? error.message : String(error));
          return null;
        },
      );

      await redisConnectPromise;
    }

    if (client.status !== 'ready') return null;

    return client;
  } catch (error) {
    markRedisUnavailable(error instanceof Error ? error.message : String(error));

    return null;
  }
}

export function getRedisDiagnostics() {
  return {
    configured: Boolean(process.env.REDIS_URL),
    clientStatus: redisClient?.status || null,
    pausedUntil:
      redisUnavailableUntil > Date.now() ? new Date(redisUnavailableUntil).toISOString() : null,
    lastError: lastRedisError,
  };
}

function getRedisTlsOptions(): RedisOptions['tls'] | undefined | null {
  const caPath = process.env.REDIS_TLS_CA_CERT_PATH;
  if (!caPath) return undefined;

  try {
    return { ca: readFileSync(caPath, 'utf8') };
  } catch (error) {
    markRedisUnavailable(
      `Failed to read REDIS_TLS_CA_CERT_PATH: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function markRedisUnavailable(message: string) {
  redisUnavailableUntil = Date.now() + redisRetryPauseMs;
  lastRedisError = message;
  recordMetric('redis.connection', { event: 'unavailable' });

  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
  }
  redisConnectPromise = null;

  if (process.env.NODE_ENV === 'production') return;
  if (Date.now() - lastRedisWarningAt < redisRetryPauseMs) return;

  lastRedisWarningAt = Date.now();
  console.warn(`[redis] cache paused for ${Math.round(redisRetryPauseMs / 1000)}s: ${message}`);
}
