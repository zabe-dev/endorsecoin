import { apiError, apiSuccess } from '@/lib/api/responses';
import { rateLimitError } from '@/lib/api/rate-limit-response';
import { db } from '@/lib/db/client';
import { mailingListSubscribers } from '@/lib/db/schema';
import { buildIpSubject, consumeRateLimit, oneHourMs } from '@/lib/security/rate-limit';
import { eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

const subscribeSchema = z.object({
  email: z.string().trim().email('Use a valid email address.').max(254),
  source: z.string().trim().max(80).optional(),
});

export async function POST(request: Request) {
  const requestHeaders = await headers();

  const limiter = await consumeRateLimit({
    action: 'mailing-list.subscribe',
    subject: buildIpSubject(requestHeaders),
    limit: 5,
    windowMs: oneHourMs,
  });

  if (!limiter.allowed) {
    return rateLimitError('', limiter);
  }

  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      'INVALID_EMAIL',
      parsed.error.issues[0]?.message || 'Use a valid email address.',
      400,
    );
  }

  const email = parsed.data.email.toLowerCase();
  const source = parsed.data.source || 'homepage';
  const [existingSubscriber] = await db
    .select({ status: mailingListSubscribers.status })
    .from(mailingListSubscribers)
    .where(eq(mailingListSubscribers.email, email))
    .limit(1);

  if (existingSubscriber?.status === 'subscribed') {
    return apiError('EMAIL_ALREADY_SUBSCRIBED', 'This email is already subscribed.', 409);
  }

  await db
    .insert(mailingListSubscribers)
    .values({
      email,
      source,
      status: 'subscribed',
      subscribedAt: new Date(),
      unsubscribedAt: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: mailingListSubscribers.email,
      set: {
        source,
        status: 'subscribed',
        subscribedAt: sql`now()`,
        unsubscribedAt: null,
        updatedAt: sql`now()`,
      },
    });

  return apiSuccess({ email }, 'You are on the list.');
}
