import { invalidateCoinInteractionCache } from '@/features/coins/server/cache-invalidation';
import { toggleCoinWatchlist } from '@/features/coins/server/interactions';
import { apiError, apiSuccess } from '@/lib/api/responses';
import { rateLimitError } from '@/lib/api/rate-limit-response';
import { auth } from '@/lib/auth/server';
import { buildRequestSubject, consumeRateLimit, twoSecondsMs } from '@/lib/security/rate-limit';
import { headers } from 'next/headers';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return apiError('AUTH_REQUIRED', 'Sign in required.', 401);

  const limiter = await consumeRateLimit({
    action: 'coin.watchlist.throttle',
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
    const result = await toggleCoinWatchlist(coinId, session.user.id);
    await invalidateCoinInteractionCache(coinId);

    return apiSuccess(
      {
        coinId,
        watching: result.watching,
        summary: result.summary,
      },
      result.watching ? 'Added to watchlist.' : 'Removed from watchlist.',
    );
  } catch (error) {
    return apiError(
      'WATCHLIST_FAILED',
      error instanceof Error ? error.message : 'Could not update your watchlist.',
      400,
    );
  }
}
