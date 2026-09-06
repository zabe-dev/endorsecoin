import { invalidateCoinDiscoveryCache } from '@/features/coins/server/cache-invalidation';
import { syncMobulaMarketData } from '@/features/coins/server/market-sync';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  if (!isAuthorizedSyncRequest(request)) {
    return NextResponse.json(
      {
        status: 'error',
        error: {
          code: 'UNAUTHORIZED',
          message: 'Market sync is not available for this request.',
        },
        data: null,
      },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const requestedLimit = Number(
    url.searchParams.get('limit') ||
      process.env.MARKET_SYNC_LIMIT ||
      process.env.MARKET_DATA_SYNC_LIMIT ||
      7,
  );
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 7;
  const result = await syncMobulaMarketData(limit);
  if (result.updated > 0) {
    await invalidateCoinDiscoveryCache();
  }

  return NextResponse.json({
    status: 'success',
    error: null,
    data: result,
  });
}

function isAuthorizedSyncRequest(request: Request) {
  const secret = process.env.MARKET_SYNC_SECRET;
  const authorization = request.headers.get('authorization') || '';

  return Boolean(secret) && authorization === `Bearer ${secret}`;
}
