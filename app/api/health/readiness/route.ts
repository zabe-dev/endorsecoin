import { apiError, apiSuccess } from '@/lib/api/responses';
import { db } from '@/lib/db/client';
import { getReadyRedisClient, getRedisDiagnostics } from '@/lib/cache/redis';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isAuthorizedDiagnosticsRequest(request)) {
    return diagnosticsUnavailableResponse();
  }

  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ready = database.ok && redis.ok;

  return ready
    ? apiSuccess({ status: 'ready', checkedAt: new Date().toISOString(), database, redis })
    : apiError('NOT_READY', 'One or more dependencies are unavailable.', 503, {
        status: 'not_ready',
        checkedAt: new Date().toISOString(),
        database,
        redis,
      });
}

async function checkDatabase() {
  const startedAt = performance.now();
  try {
    await db.execute(sql`select 1`);
    return { ok: true, durationMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : 'Database check failed.',
    };
  }
}

async function checkRedis() {
  const startedAt = performance.now();
  if (!process.env.REDIS_URL) {
    return { ok: true, configured: false, durationMs: Math.round(performance.now() - startedAt) };
  }

  try {
    const redis = await getReadyRedisClient();
    if (!redis) {
      const diagnostics = getRedisDiagnostics();
      throw new Error(diagnostics.lastError || 'Redis client is unavailable.');
    }
    await redis.ping();
    return { ok: true, configured: true, durationMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : 'Redis check failed.',
    };
  }
}

function isAuthorizedDiagnosticsRequest(request: Request) {
  const token = process.env.DIAGNOSTICS_TOKEN || process.env.HEALTH_READINESS_TOKEN;
  if (!token) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${token}`;
}

function diagnosticsUnavailableResponse() {
  const token = process.env.DIAGNOSTICS_TOKEN || process.env.HEALTH_READINESS_TOKEN;
  return NextResponse.json(
    {
      success: false,
      code: token ? 'UNAUTHORIZED' : 'NOT_FOUND',
      message: token ? 'Diagnostics are not available for this request.' : 'Not found.',
      data: null,
    },
    { status: token ? 401 : 404 },
  );
}
