'use client';

import { RATE_LIMIT_MESSAGE } from '@/lib/api/rate-limit-message';
import { toast } from 'sonner';

type RateLimitBody = {
  code?: string;
  message?: string;
  status?: number;
  statusCode?: number;
  data?: {
    retryAfterSeconds?: number;
  };
  body?: {
    code?: string;
    message?: string;
  };
};

export function showRateLimitToast(value: unknown, _fallback = 'request') {
  const body = readRateLimitBody(value);
  const code = body?.code || body?.body?.code || '';
  const status = body?.status || body?.statusCode;
  if (code !== 'RATE_LIMITED' && status !== 429) return false;

  toast.warning(RATE_LIMIT_MESSAGE, {
    duration: 3600,
    className: 'spooky-toast',
  });
  return true;
}

function readRateLimitBody(value: unknown): RateLimitBody | null {
  if (!value || typeof value !== 'object') return null;
  return value as RateLimitBody;
}
