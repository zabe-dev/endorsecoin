import 'server-only';

import { db } from '@/lib/db/client';
import { rateLimits } from '@/lib/db/schema';
import { getClientIp } from '@/lib/http/client-ip';
import { sql } from 'drizzle-orm';
import { eq, lt } from 'drizzle-orm';

type RateLimitOptions = {
  action: string;
  subject: string;
  limit: number;
  windowMs: number;
};

type RequestSubjectOptions = {
  requestHeaders: Headers;
  userId?: string | null;
  email?: string | null;
  prefix?: string;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
  resetAt: string;
};

const fallbackAttempts = new Map<string, number[]>();

export const oneHourMs = 60 * 60 * 1000;
export const fifteenMinutesMs = 15 * 60 * 1000;
export const twoSecondsMs = 2 * 1000;

export async function consumeRateLimit({
  action,
  subject,
  limit,
  windowMs,
}: RateLimitOptions): Promise<RateLimitResult> {
  const cleanAction = normalizeKeyPart(action);
  const cleanSubject = normalizeKeyPart(subject || 'unknown');
  const key = `${cleanAction}:${cleanSubject}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);
  const nowIso = now.toISOString();
  const expiresAtIso = expiresAt.toISOString();

  try {
    const rows = await db.execute<{ count: number; expiresAt: Date | string }>(sql`
      insert into ${rateLimits} (
        "key",
        "action",
        "subject",
        "count",
        "window_start",
        "expires_at",
        "updated_at"
      )
      values (
        ${key},
        ${cleanAction},
        ${cleanSubject},
        1,
        ${nowIso}::timestamptz,
        ${expiresAtIso}::timestamptz,
        ${nowIso}::timestamptz
      )
      on conflict ("key") do update set
        "count" = case
          when "rate_limits"."expires_at" <= ${nowIso}::timestamptz then 1
          else "rate_limits"."count" + 1
        end,
        "window_start" = case
          when "rate_limits"."expires_at" <= ${nowIso}::timestamptz
          then ${nowIso}::timestamptz
          else "rate_limits"."window_start"
        end,
        "expires_at" = case
          when "rate_limits"."expires_at" <= ${nowIso}::timestamptz
          then ${expiresAtIso}::timestamptz
          else "rate_limits"."expires_at"
        end,
        "updated_at" = ${nowIso}::timestamptz
      returning
        "count",
        "expires_at" as "expiresAt"
    `);

    const row = rows[0];
    const result = buildResult({
      count: Number(row?.count || 1),
      limit,
      expiresAt: readDate(row?.expiresAt) || expiresAt,
    });

    void cleanupExpiredRateLimits();
    return result;
  } catch (error) {
    console.error('[rate-limit] Database limiter failed; using in-memory fallback.', error);
    return consumeFallbackRateLimit({
      action: cleanAction,
      subject: cleanSubject,
      limit,
      windowMs,
    });
  }
}

export async function peekRateLimit({
  action,
  subject,
  limit,
}: Omit<RateLimitOptions, 'windowMs'>): Promise<RateLimitResult | null> {
  const cleanAction = normalizeKeyPart(action);
  const cleanSubject = normalizeKeyPart(subject || 'unknown');
  const key = `${cleanAction}:${cleanSubject}`;
  const now = new Date();

  try {
    const [existing] = await db
      .select({
        count: rateLimits.count,
        expiresAt: rateLimits.expiresAt,
      })
      .from(rateLimits)
      .where(eq(rateLimits.key, key))
      .limit(1);

    if (!existing || existing.expiresAt <= now || existing.count < limit) return null;
    return buildResult({ count: existing.count, limit, expiresAt: existing.expiresAt });
  } catch (error) {
    console.error('[rate-limit] Database limiter peek failed.', error);
    return null;
  }
}

export async function resetRateLimit(action: string, subject: string) {
  const key = `${normalizeKeyPart(action)}:${normalizeKeyPart(subject || 'unknown')}`;
  try {
    await db.delete(rateLimits).where(eq(rateLimits.key, key));
  } catch (error) {
    console.error('[rate-limit] Failed to reset limiter.', error);
  }
  fallbackAttempts.delete(key);
}

export function buildRequestSubject({
  requestHeaders,
  userId,
  email,
  prefix,
}: RequestSubjectOptions) {
  const ip = getClientIp(requestHeaders) || 'unknown-ip';
  const identity = userId || normalizeEmail(email) || 'anonymous';
  return `${prefix ? `${prefix}:` : ''}${identity}:ip:${ip}`;
}

export function buildIpSubject(requestHeaders: Headers, prefix?: string) {
  const ip = getClientIp(requestHeaders) || 'unknown-ip';
  return `${prefix ? `${prefix}:` : ''}ip:${ip}`;
}

export function normalizeEmail(email?: string | null) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function buildResult({
  count,
  limit,
  expiresAt,
}: {
  count: number;
  limit: number;
  expiresAt: Date;
}): RateLimitResult {
  const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
  return {
    allowed: count <= limit,
    retryAfterSeconds,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: expiresAt.toISOString(),
  };
}

function consumeFallbackRateLimit({
  action,
  subject,
  limit,
  windowMs,
}: RateLimitOptions): RateLimitResult {
  const key = `${normalizeKeyPart(action)}:${normalizeKeyPart(subject || 'unknown')}`;
  const now = Date.now();
  const active = (fallbackAttempts.get(key) || []).filter(
    (timestamp) => now - timestamp < windowMs,
  );
  if (active.length >= limit) {
    fallbackAttempts.set(key, active);
    const oldest = active[0] || now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      limit,
      remaining: 0,
      resetAt: new Date(oldest + windowMs).toISOString(),
    };
  }

  const next = [...active, now];
  fallbackAttempts.set(key, next);
  return {
    allowed: true,
    retryAfterSeconds: Math.ceil(windowMs / 1000),
    limit,
    remaining: Math.max(0, limit - next.length),
    resetAt: new Date((next[0] || now) + windowMs).toISOString(),
  };
}

function normalizeKeyPart(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 220) || 'unknown';
}

function readDate(value: Date | string | undefined) {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

async function cleanupExpiredRateLimits() {
  try {
    await db.delete(rateLimits).where(lt(rateLimits.expiresAt, new Date()));
  } catch {
    // Best-effort cleanup only.
  }
}
