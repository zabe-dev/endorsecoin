import { apiError, apiSuccess } from '@/lib/api/responses';
import { getMetricsSnapshot } from '@/lib/observability/metrics';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  if (!isAuthorizedDiagnosticsRequest(request)) {
    return diagnosticsUnavailableResponse();
  }

  return apiSuccess({
    status: 'ok',
    checkedAt: new Date().toISOString(),
    metrics: getMetricsSnapshot(),
  });
}

function isAuthorizedDiagnosticsRequest(request: Request) {
  const token = process.env.DIAGNOSTICS_TOKEN || process.env.METRICS_TOKEN;
  if (!token) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${token}`;
}

function diagnosticsUnavailableResponse() {
  const token = process.env.DIAGNOSTICS_TOKEN || process.env.METRICS_TOKEN;
  if (!token)
    return NextResponse.json(
      { success: false, code: 'NOT_FOUND', message: 'Not found.', data: null },
      { status: 404 },
    );
  return apiError('UNAUTHORIZED', 'Metrics are not available for this request.', 401);
}
