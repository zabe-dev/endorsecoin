import { apiSuccess } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

export function GET() {
  return apiSuccess(
    {
      status: 'ok',
      service: 'endorsecoin',
      checkedAt: new Date().toISOString(),
    },
    'Service is running.',
  );
}
