import { lookupApprovedProjectExact } from '@/features/airdrops/server/approved-projects';
import { apiError, apiSuccess } from '@/lib/api/responses';
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';

const maxProjectQueryLength = 120;

export async function GET(request: Request) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return apiError('AUTH_REQUIRED', 'Sign in required.', 401);

  const query = new URL(request.url).searchParams.get('q') || '';
  if (query.length > maxProjectQueryLength) {
    return apiError('PROJECT_QUERY_TOO_LONG', 'Project name is too long.', 400);
  }

  const result = await lookupApprovedProjectExact(query);
  return apiSuccess(result);
}
