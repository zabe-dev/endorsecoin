import { airdropSubmissionPayloadSchema } from '@/features/submissions/schemas/airdrop-submission';
import { apiError, apiSuccess } from '@/lib/api/responses';
import { rateLimitError } from '@/lib/api/rate-limit-response';
import { auth } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { isMissingRelationError } from '@/lib/db/errors';
import { airdropSubmissions, coins } from '@/lib/db/schema';
import { getClientIp } from '@/lib/http/client-ip';
import { recordMetric } from '@/lib/observability/metrics';
import { buildRequestSubject, consumeRateLimit, oneHourMs } from '@/lib/security/rate-limit';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

const maxSubmissionBodyBytes = 80_000;

export async function POST(request: Request) {
  recordSubmissionMetric('attempt');
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) {
    recordSubmissionMetric('rejected', { code: 'AUTH_REQUIRED' });
    return apiError('AUTH_REQUIRED', 'Sign in required.', 401);
  }

  const contentLength = Number(requestHeaders.get('content-length') || 0);
  if (contentLength > maxSubmissionBodyBytes) {
    recordSubmissionMetric('rejected', { code: 'SUBMISSION_TOO_LARGE' });
    return apiError('SUBMISSION_TOO_LARGE', 'Submission is too large.', 413);
  }

  const limiter = await consumeRateLimit({
    action: 'airdrop-submission.create',
    subject: buildRequestSubject({ requestHeaders, userId: session.user.id }),
    limit: 5,
    windowMs: oneHourMs,
  });

  if (!limiter.allowed) {
    recordSubmissionMetric('rejected', { code: 'RATE_LIMITED' });
    return rateLimitError('', limiter);
  }

  const rawBody = await request.text().catch(() => '');
  if (byteLength(rawBody) > maxSubmissionBodyBytes) {
    recordSubmissionMetric('rejected', { code: 'SUBMISSION_TOO_LARGE' });
    return apiError('SUBMISSION_TOO_LARGE', 'Submission is too large.', 413);
  }

  const parsed = airdropSubmissionPayloadSchema.safeParse(parseJson(rawBody));
  if (!parsed.success) {
    recordSubmissionMetric('rejected', { code: 'INVALID_SUBMISSION' });
    return apiError(
      'INVALID_SUBMISSION',
      parsed.error.issues[0]?.message || 'Invalid submission.',
      400,
    );
  }

  const payload = parsed.data;
  const [project] = await db
    .select({ id: coins.id })
    .from(coins)
    .where(and(eq(coins.id, payload.coinId), eq(coins.listingStatus, 'active')))
    .limit(1);

  if (!project) {
    recordSubmissionMetric('rejected', { code: 'INVALID_PROJECT' });
    return apiError('INVALID_PROJECT', 'Select an approved project listed on EndorseCoin.', 400);
  }

  const turnstile = await verifyTurnstile(payload.turnstileToken || '', requestHeaders);
  if (!turnstile.ok) {
    recordSubmissionMetric('turnstile_failed', { code: turnstile.code || 'unknown' });
    return apiError(
      'TURNSTILE_FAILED',
      turnstile.error || 'Could not verify this submission. Please try again.',
      400,
    );
  }

  try {
    const [submission] = await db
      .insert(airdropSubmissions)
      .values({
        coinId: payload.coinId,
        submittedByUserId: session.user.id,
        requesterEmail: session.user.email,
        name: payload.name,
        claimRewardsUrl: payload.claimRewardsUrl,
        description: payload.description,
        rewards: payload.rewards,
        winnersCount: payload.winnersCount,
        startsAt: new Date(payload.startsAt),
        endsAt: new Date(payload.endsAt),
        website: payload.website,
        socialLinks: payload.socialLinks,
        status: 'pending',
      })
      .returning({ id: airdropSubmissions.id });

    if (!submission) return apiError('CREATE_FAILED', 'Could not submit your airdrop.', 500);

    recordSubmissionMetric('created');
    return apiSuccess({ id: submission.id }, 'Airdrop submitted for review.');
  } catch (error) {
    if (isMissingRelationError(error, 'airdrop_submissions')) {
      recordSubmissionMetric('rejected', { code: 'AIRDROP_SUBMISSIONS_UNAVAILABLE' });
      return apiError(
        'AIRDROP_SUBMISSIONS_UNAVAILABLE',
        'Airdrop submissions are not ready yet. Run the latest database migrations, then try again.',
        503,
      );
    }

    console.error('[airdrop-submissions] create failed', error);
    recordSubmissionMetric('rejected', { code: 'CREATE_FAILED' });
    return apiError('CREATE_FAILED', 'Could not submit your airdrop right now.', 500);
  }
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

async function verifyTurnstile(token: string, requestHeaders: Headers) {
  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true };
  if (!token)
    return {
      ok: false,
      code: 'missing_token',
      error: 'Please complete the verification before submitting.',
    };

  const remoteip = getClientIp(requestHeaders);
  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  if (remoteip) formData.append('remoteip', remoteip);

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const result = (await response.json().catch(() => null)) as {
      success?: boolean;
      'error-codes'?: string[];
    } | null;
    if (result?.success) return { ok: true };

    const errorCodes = result?.['error-codes']?.join(', ');
    return {
      ok: false,
      code: errorCodes || 'verification_failed',
      error:
        process.env.NODE_ENV === 'production' || !errorCodes
          ? 'Could not verify this submission. Please try again.'
          : `Could not verify this submission. Turnstile error: ${errorCodes}`,
    };
  } catch {
    return {
      ok: false,
      code: 'network_error',
      error: 'Could not verify this submission. Please try again.',
    };
  }
}

function recordSubmissionMetric(event: string, fields: Record<string, string> = {}) {
  recordMetric('submission.airdrop', { event, ...fields });
}
