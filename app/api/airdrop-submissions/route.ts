import { airdropSubmissionPayloadSchema } from '@/features/submissions/schemas/airdrop-submission';
import { apiError, apiSuccess } from '@/lib/api/responses';
import { rateLimitError } from '@/lib/api/rate-limit-response';
import { auth } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { airdropSubmissions, coins } from '@/lib/db/schema';
import { getClientIp } from '@/lib/http/client-ip';
import { buildRequestSubject, consumeRateLimit, oneHourMs } from '@/lib/security/rate-limit';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

const maxSubmissionBodyBytes = 80_000;

export async function POST(request: Request) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return apiError('AUTH_REQUIRED', 'Sign in required.', 401);

  const contentLength = Number(requestHeaders.get('content-length') || 0);
  if (contentLength > maxSubmissionBodyBytes) {
    return apiError('SUBMISSION_TOO_LARGE', 'Submission is too large.', 413);
  }

  const limiter = await consumeRateLimit({
    action: 'airdrop-submission.create',
    subject: buildRequestSubject({ requestHeaders, userId: session.user.id }),
    limit: 5,
    windowMs: oneHourMs,
  });

  if (!limiter.allowed) return rateLimitError('', limiter);

  const rawBody = await request.text().catch(() => '');
  if (byteLength(rawBody) > maxSubmissionBodyBytes) {
    return apiError('SUBMISSION_TOO_LARGE', 'Submission is too large.', 413);
  }

  const parsed = airdropSubmissionPayloadSchema.safeParse(parseJson(rawBody));
  if (!parsed.success) {
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
    return apiError('INVALID_PROJECT', 'Select an approved project listed on EndorseCoin.', 400);
  }

  const turnstile = await verifyTurnstile(payload.turnstileToken || '', requestHeaders);
  if (!turnstile.ok) {
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

    return apiSuccess({ id: submission.id }, 'Airdrop submitted for review.');
  } catch (error) {
    if (isMissingAirdropSubmissionsTable(error)) {
      return apiError(
        'AIRDROP_SUBMISSIONS_UNAVAILABLE',
        'Airdrop submissions are not ready yet. Run the latest database migrations, then try again.',
        503,
      );
    }

    console.error('[airdrop-submissions] create failed', error);
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
  if (!token) return { ok: false, error: 'Please complete the verification before submitting.' };

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
      error:
        process.env.NODE_ENV === 'production' || !errorCodes
          ? 'Could not verify this submission. Please try again.'
          : `Could not verify this submission. Turnstile error: ${errorCodes}`,
    };
  } catch {
    return { ok: false, error: 'Could not verify this submission. Please try again.' };
  }
}

function isMissingAirdropSubmissionsTable(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string; cause?: unknown };
  if (candidate.code === '42P01') return true;
  if (candidate.message?.includes('airdrop_submissions')) return true;

  const cause = candidate.cause;
  if (!cause || typeof cause !== 'object') return false;
  const nested = cause as { code?: string; message?: string };
  return nested.code === '42P01' || Boolean(nested.message?.includes('airdrop_submissions'));
}
