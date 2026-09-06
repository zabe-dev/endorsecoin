import { invalidateCoinInteractionCache } from '@/features/coins/server/cache-invalidation';
import { recordCoinVote } from '@/features/coins/server/interactions';
import { apiError, apiSuccess } from '@/lib/api/responses';
import { rateLimitError } from '@/lib/api/rate-limit-response';
import { auth } from '@/lib/auth/server';
import { getClientIp } from '@/lib/http/client-ip';
import { buildRequestSubject, consumeRateLimit, twoSecondsMs } from '@/lib/security/rate-limit';
import { headers } from 'next/headers';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return apiError('AUTH_REQUIRED', 'Sign in required.', 401);

  const ipAddress = getClientIp(requestHeaders);
  const limiter = await consumeRateLimit({
    action: 'coin.vote.throttle',
    subject: buildRequestSubject({ requestHeaders, userId: session.user.id }),
    limit: 1,
    windowMs: twoSecondsMs,
  });

  if (!limiter.allowed) {
    return rateLimitError('', limiter);
  }

  const { id } = await params;
  const coinId = Number(id);
  if (!Number.isSafeInteger(coinId) || coinId < 1) {
    return apiError('INVALID_COIN_ID', 'Coin not found.', 404);
  }

  try {
    const result = await recordCoinVote({
      coinId,
      userId: session.user.id,
      ipAddress,
      userAgent: requestHeaders.get('user-agent'),
    });

    if (!result.ok) {
      return apiError(result.code, result.message, 429, {
        coinId,
        nextVoteAt: result.nextVoteAt,
        summary: result.summary,
      });
    }

    await invalidateCoinInteractionCache(coinId);

    return apiSuccess(
      {
        coinId,
        nextVoteAt: result.nextVoteAt,
        summary: result.summary,
      },
      result.message,
    );
  } catch (error) {
    return apiError(
      'VOTE_FAILED',
      error instanceof Error ? error.message : 'Could not record your vote.',
      400,
    );
  }
}
