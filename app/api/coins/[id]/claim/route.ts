import { hasAdminAccess } from '@/lib/auth/roles';
import { apiError } from '@/lib/api/responses';
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return apiError('AUTH_REQUIRED', 'Sign in required.', 401);
  if (!hasAdminAccess(session.user.role)) {
    return apiError('ADMIN_REQUIRED', 'Admin access required.', 403);
  }

  return apiError(
    'CLAIM_SUPPORT_REQUIRED',
    'Contact @EndorseCoinSupport to claim this coin for $100.',
    410,
  );
}
