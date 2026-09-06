import { apiError, apiSuccess } from '@/lib/api/responses';
import { runScheduledMaintenance } from '@/lib/maintenance/run';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isAuthorizedMaintenanceRequest(request)) {
    return apiError('UNAUTHORIZED', 'Maintenance is not available for this request.', 401);
  }

  const result = await runScheduledMaintenance();
  return apiSuccess(result, 'Maintenance completed.');
}

export async function GET(request: Request) {
  return POST(request);
}

function isAuthorizedMaintenanceRequest(request: Request) {
  const secret = process.env.MAINTENANCE_SECRET || process.env.DIAGNOSTICS_TOKEN;
  const authorization = request.headers.get('authorization') || '';

  return Boolean(secret) && authorization === `Bearer ${secret}`;
}
