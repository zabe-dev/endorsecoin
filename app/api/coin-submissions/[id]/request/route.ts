import { auth } from '@/lib/auth/server';
import { apiError, apiSuccess } from '@/lib/api/responses';
import { rateLimitError } from '@/lib/api/rate-limit-response';
import { invalidateCoinDiscoveryCache } from '@/features/coins/server/cache-invalidation';
import { db } from '@/lib/db/client';
import { coins, coinSubmissions } from '@/lib/db/schema';
import { buildRequestSubject, consumeRateLimit, oneHourMs } from '@/lib/security/rate-limit';
import { and, eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

const requestSchema = z.object({
  action: z.enum(['delete', 'cancel-delete']),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return apiError('AUTH_REQUIRED', 'Sign in required.', 401);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError('INVALID_REQUEST', parsed.error.issues[0]?.message || 'Invalid request.', 400);

  const { id } = await context.params;
  const [owned] = await db
    .select()
    .from(coinSubmissions)
    .where(
      and(
        eq(coinSubmissions.id, id),
        eq(coinSubmissions.requesterEmail, session.user.email),
        eq(coinSubmissions.submissionType, 'new-coin'),
      ),
    )
    .limit(1);
  if (!owned) return apiError('SUBMISSION_NOT_FOUND', 'Submission not found.', 404);

  const [existingDeleteRequest] = await db
    .select({ id: coinSubmissions.id, coinData: coinSubmissions.coinData })
    .from(coinSubmissions)
    .where(
      and(
        eq(coinSubmissions.requesterEmail, session.user.email),
        eq(coinSubmissions.submissionType, 'delete-request'),
        eq(coinSubmissions.status, 'pending'),
        sql`${coinSubmissions.coinData}->>'sourceSubmissionId' = ${owned.id}`,
      ),
    )
    .limit(1);

  if (parsed.data.action === 'cancel-delete') {
    if (!existingDeleteRequest) {
      return apiSuccess(
        { id: owned.id, scheduledDeleteAt: null },
        'Deletion request is already cancelled.',
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(coinSubmissions)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(coinSubmissions.id, existingDeleteRequest.id));

      if (owned.coinId) {
        await tx
          .update(coins)
          .set({ listingStatus: 'active', updatedAt: new Date() })
          .where(eq(coins.id, owned.coinId));
      }
    });

    await invalidateCoinDiscoveryCache(owned.coinId);

    return apiSuccess({ id: owned.id, scheduledDeleteAt: null }, 'Deletion request cancelled.');
  }

  const limiter = await consumeRateLimit({
    action: 'coin.delete-request',
    subject: buildRequestSubject({ requestHeaders, userId: session.user.id }),
    limit: 5,
    windowMs: oneHourMs,
  });

  if (!limiter.allowed) {
    return rateLimitError('', limiter);
  }

  if (existingDeleteRequest) {
    const scheduledDeleteAt = readScheduledDeleteAt(existingDeleteRequest.coinData);
    return apiSuccess(
      { id: owned.id, scheduledDeleteAt },
      'Deletion request is already scheduled.',
    );
  }

  const scheduledDeleteAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    if (owned.coinId) {
      await tx
        .update(coins)
        .set({ listingStatus: 'suspended', updatedAt: new Date() })
        .where(eq(coins.id, owned.coinId));
    }

    await tx.insert(coinSubmissions).values({
      coinId: owned.coinId,
      requesterEmail: session.user.email,
      requesterTelegram: owned.requesterTelegram,
      submissionType: 'delete-request',
      status: 'pending',
      coinData: {
        sourceSubmissionId: owned.id,
        requestedChanges: 'Delete this coin listing.',
        scheduledDeleteAt: scheduledDeleteAt.toISOString(),
      },
    });
  });
  await invalidateCoinDiscoveryCache(owned.coinId);

  return apiSuccess(
    { id: owned.id, scheduledDeleteAt: scheduledDeleteAt.toISOString() },
    'Deletion request sent.',
  );
}

function readScheduledDeleteAt(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const scheduledDeleteAt = (value as Record<string, unknown>).scheduledDeleteAt;
  return typeof scheduledDeleteAt === 'string' ? scheduledDeleteAt : null;
}
