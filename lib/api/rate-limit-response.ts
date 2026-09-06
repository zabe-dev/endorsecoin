import { apiError } from '@/lib/api/responses';
import { RATE_LIMIT_MESSAGE } from '@/lib/api/rate-limit-message';
import type { RateLimitResult } from '@/lib/security/rate-limit';

export function rateLimitError(_message: string, result: RateLimitResult) {
  return apiError('RATE_LIMITED', RATE_LIMIT_MESSAGE, 429, {
    retryAfterSeconds: result.retryAfterSeconds,
    resetAt: result.resetAt,
  });
}
