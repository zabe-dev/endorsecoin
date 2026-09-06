import { refreshTopbarPrices } from '@/features/topbar/server/market-prices';
import { apiError, apiSuccess } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isAuthorizedTopbarRefreshRequest(request)) {
    return apiError('UNAUTHORIZED', 'Topbar price refresh is not available for this request.', 401);
  }

  const result = await refreshTopbarPrices();
  return apiSuccess({ updated: result.updated }, 'Topbar prices refreshed.');
}

export async function GET(request: Request) {
  return POST(request);
}

function isAuthorizedTopbarRefreshRequest(request: Request) {
  const secret =
    process.env.TOPBAR_PRICE_REFRESH_SECRET ||
    process.env.MAINTENANCE_SECRET ||
    process.env.DIAGNOSTICS_TOKEN;
  const authorization = request.headers.get('authorization') || '';

  return Boolean(secret) && authorization === `Bearer ${secret}`;
}
