import { RATE_LIMIT_MESSAGE } from '@/lib/api/rate-limit-message';
import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { getClientIp } from '@/lib/http/client-ip';
import {
  buildIpSubject,
  consumeRateLimit,
  fifteenMinutesMs,
  normalizeEmail,
  oneHourMs,
  peekRateLimit,
  resetRateLimit,
} from '@/lib/security/rate-limit';
import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { admin, emailOTP } from 'better-auth/plugins';
import { Resend } from 'resend';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const resendApiKey = process.env.RESEND_API_KEY;
const authEmailFrom = process.env.AUTH_EMAIL_FROM || 'EndorseCoin <onboarding@resend.dev>';
const authCodeTemplateId = process.env.RESEND_AUTH_CODE_TEMPLATE_ID;
const authSecret =
  process.env.BETTER_AUTH_SECRET ||
  (process.env.NODE_ENV === 'production' ? undefined : 'endorsecoin-local-dev-secret-change-me');
const authUrl =
  process.env.BETTER_AUTH_URL ||
  (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000');
const resend = resendApiKey ? new Resend(resendApiKey) : null;

type AuthEmailType = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

async function sendAuthCodeEmail({
  email,
  otp,
  type,
  request,
}: {
  email: string;
  otp: string;
  type: AuthEmailType;
  request?: Request;
}) {
  const requestDetails = getAuthRequestDetails(request);
  const subject = `${otp} is your verification code`;

  if (!resend) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[EndorseCoin auth] ${type} OTP for ${email}: ${otp}`);
      return;
    }

    console.error('[EndorseCoin auth] RESEND_API_KEY is missing; auth email was not sent.');
    throw new Error('AUTH_EMAIL_SEND_FAILED');
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info(`[EndorseCoin auth] Sending ${type} OTP to ${email} with Resend.`);
  }

  const { error } = await resend.emails.send({
    from: authEmailFrom,
    to: email,
    subject,
    ...(authCodeTemplateId
      ? {
          template: {
            id: authCodeTemplateId,
            variables: {
              otp,
              type,
              appName: 'EndorseCoin',
              requestIp: requestDetails.ip,
              requestLocation: requestDetails.location,
              requestDate: requestDetails.date,
              requestTime: requestDetails.time,
            },
          },
        }
      : {
          text: buildAuthCodeEmailText({ otp, requestDetails }),
        }),
  });

  if (error) {
    console.error('[EndorseCoin auth] Failed to send auth email with Resend.', {
      type,
      name: error.name,
      message: error.message,
    });
    throw new Error('AUTH_EMAIL_SEND_FAILED');
  }
}

export const auth = betterAuth({
  appName: 'EndorseCoin',
  secret: authSecret,
  baseURL: authUrl,
  advanced: {
    // Behind Cloudflare (proxied) + Traefik with forwardedHeaders.trustedIPs locked to
    // Cloudflare's edge ranges, and the Vultr firewall restricting 80/443 to Cloudflare
    // only, cf-connecting-ip cannot be spoofed by end users. This governs the IP better-auth
    // stores on sessions (surfaced in the admin dashboard's "Last IP Used" column) and any
    // built-in rate limiting. Without this, better-auth falls back to its own default IP
    // detection, which does not trust cf-connecting-ip or forwarded chains automatically.
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip'],
    },
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  user: {
    changeEmail: { enabled: true },
    deleteUser: { enabled: true },
  },
  hooks: {
    before: async (ctx) => {
      await validateAuthRateLimits(ctx);
      await validateSettingsUpdates(ctx);
    },
    after: async (ctx) => {
      await recordAuthFailures(ctx);
      return {};
    },
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : undefined,
  plugins: [
    admin({
      defaultRole: 'user',
      adminRoles: ['admin'],
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      async sendVerificationOTP({ email, otp, type }, ctx) {
        await sendAuthCodeEmail({ email, otp, type, request: ctx?.request });
      },
    }),
    nextCookies(),
  ],
});

async function validateSettingsUpdates(ctx: unknown): Promise<void> {
  const request = ctx as {
    path?: string;
    body?: {
      name?: string;
      currentPassword?: string;
      newPassword?: string;
    };
    context: {
      session?: {
        user?: {
          name?: string;
        } | null;
      } | null;
    };
  };

  if (request.path === '/update-user' && typeof request.body?.name === 'string') {
    const name = request.body.name.trim();
    const currentName = (request.context.session?.user?.name || '').trim();

    if (name.length < 4) {
      throw APIError.fromStatus('BAD_REQUEST', {
        message: 'Name needs at least 4 characters.',
      });
    }

    if (name === currentName) {
      throw APIError.fromStatus('BAD_REQUEST', {
        message: 'Name is unchanged.',
      });
    }
  }

  if (request.path === '/change-password') {
    const currentPassword =
      typeof request.body?.currentPassword === 'string' ? request.body.currentPassword : '';
    const newPassword =
      typeof request.body?.newPassword === 'string' ? request.body.newPassword : '';

    if (newPassword && newPassword === currentPassword) {
      throw APIError.fromStatus('BAD_REQUEST', {
        message: 'New password must be different from the current password.',
      });
    }
  }
}

async function validateAuthRateLimits(ctx: unknown): Promise<void> {
  const request = readAuthContext(ctx);
  const path = request.path;
  if (!isRateLimitedAuthPath(path)) return;

  const email = normalizeEmail(readBodyString(request.body.email));

  if (path === '/sign-in/email') {
    const emailIpLimit = email
      ? await peekRateLimit({
          action: 'auth.login.failed.email-ip',
          subject: buildAuthEmailIpSubject(email, request.headers),
          limit: 5,
        })
      : null;
    const ipLimit = await peekRateLimit({
      action: 'auth.login.failed.ip',
      subject: buildIpSubject(request.headers),
      limit: 20,
    });

    if (emailIpLimit || ipLimit) {
      throwAuthRateLimit();
    }
  }

  if (path === '/sign-up/email') {
    const limit = await consumeRateLimit({
      action: 'auth.signup',
      subject: buildIpSubject(request.headers),
      limit: 5,
      windowMs: oneHourMs,
    });

    if (!limit.allowed) {
      throwAuthRateLimit();
    }
  }

  if (path === '/email-otp/request-password-reset') {
    const limit = await consumeRateLimit({
      action: 'auth.password-reset.request',
      subject: buildAuthEmailIpSubject(email, request.headers),
      limit: 5,
      windowMs: oneHourMs,
    });

    if (!limit.allowed) {
      throwAuthRateLimit();
    }
  }

  if (path === '/email-otp/reset-password') {
    const limit = await peekRateLimit({
      action: 'auth.password-reset.failed',
      subject: buildAuthEmailIpSubject(email, request.headers),
      limit: 5,
    });

    if (limit) {
      throwAuthRateLimit();
    }
  }
}

async function recordAuthFailures(ctx: unknown): Promise<void> {
  const request = readAuthContext(ctx);
  const path = request.path;
  if (path !== '/sign-in/email' && path !== '/email-otp/reset-password') return;

  const response = request.response;
  const failed = isAuthFailureResponse(response);
  const email = normalizeEmail(readBodyString(request.body.email));

  if (path === '/sign-in/email') {
    if (!failed) {
      if (email) {
        await resetRateLimit(
          'auth.login.failed.email-ip',
          buildAuthEmailIpSubject(email, request.headers),
        );
      }
      return;
    }

    if (!isRateLimitResponse(response)) {
      if (email) {
        await consumeRateLimit({
          action: 'auth.login.failed.email-ip',
          subject: buildAuthEmailIpSubject(email, request.headers),
          limit: 5,
          windowMs: fifteenMinutesMs,
        });
      }

      await consumeRateLimit({
        action: 'auth.login.failed.ip',
        subject: buildIpSubject(request.headers),
        limit: 20,
        windowMs: fifteenMinutesMs,
      });
    }
  }

  if (path === '/email-otp/reset-password') {
    if (!failed) {
      if (email) {
        await resetRateLimit(
          'auth.password-reset.failed',
          buildAuthEmailIpSubject(email, request.headers),
        );
      }
      return;
    }

    if (!isRateLimitResponse(response) && isOtpFailureResponse(response)) {
      await consumeRateLimit({
        action: 'auth.password-reset.failed',
        subject: buildAuthEmailIpSubject(email, request.headers),
        limit: 5,
        windowMs: fifteenMinutesMs,
      });
    }
  }
}

function readAuthContext(ctx: unknown) {
  if (!ctx || typeof ctx !== 'object') {
    return {
      path: '',
      body: {},
      headers: new Headers(),
      response: undefined,
    };
  }

  const value = ctx as {
    path?: string;
    body?: Record<string, unknown>;
    headers?: Headers;
    request?: Request;
    context?: {
      returned?: unknown;
    };
  };

  return {
    path: value.path || '',
    body: value.body || {},
    headers: value.headers || value.request?.headers || new Headers(),
    response: value.context?.returned,
  };
}

function isRateLimitedAuthPath(path: string) {
  return (
    path === '/sign-in/email' ||
    path === '/sign-up/email' ||
    path === '/email-otp/request-password-reset' ||
    path === '/email-otp/reset-password'
  );
}

function readBodyString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function buildAuthEmailIpSubject(email: string, requestHeaders: Headers) {
  return `email:${email || 'unknown'}:${buildIpSubject(requestHeaders)}`;
}

function isAuthFailureResponse(response: unknown) {
  if (!response || typeof response !== 'object') return false;
  const statusCode = (response as { statusCode?: number; status?: number | string }).statusCode;
  const status = (response as { statusCode?: number; status?: number | string }).status;
  if (typeof statusCode === 'number') return statusCode >= 400;
  if (typeof status === 'number') return status >= 400;
  return false;
}

function isRateLimitResponse(response: unknown) {
  if (!response || typeof response !== 'object') return false;
  const body = (response as { body?: { code?: string } }).body;
  return body?.code === 'RATE_LIMITED';
}

function isOtpFailureResponse(response: unknown) {
  if (!response || typeof response !== 'object') return false;
  const body = (response as { body?: { code?: string; message?: string } }).body;
  const code = body?.code?.toLowerCase() || '';
  const message = body?.message?.toLowerCase() || '';
  return code.includes('otp') || message.includes('otp') || message.includes('code');
}

function throwAuthRateLimit(): never {
  throw APIError.from('TOO_MANY_REQUESTS', {
    code: 'RATE_LIMITED',
    message: RATE_LIMIT_MESSAGE,
  });
}

function getAuthRequestDetails(request?: Request) {
  const headers = request?.headers;
  const ip = (headers && getClientIp(headers)) || 'Unknown IP';
  const city = decodeHeader(headers?.get('cf-ipcity')) || '';
  const country = formatCountry(
    decodeHeader(headers?.get('cf-ipcountry')) || decodeHeader(headers?.get('x-country')) || '',
  );
  const now = new Date();

  return {
    ip,
    location: formatLocation(city, country),
    date: new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(now),
    time: `${new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    }).format(now)} UTC`,
  };
}

function decodeHeader(value?: string | null) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatCountry(value: string) {
  const country = value.trim();
  if (!country) return '';
  if (/^[A-Z]{2}$/i.test(country)) {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(country.toUpperCase()) || country;
    } catch {
      return country.toUpperCase();
    }
  }
  return country;
}

function formatLocation(city: string, country: string) {
  if (city && country) return `${city}, ${country}`;
  if (country) return country;
  if (city) return city;
  return 'Unknown location';
}

function buildAuthCodeEmailText({
  otp,
  requestDetails,
}: {
  otp: string;
  requestDetails: ReturnType<typeof getAuthRequestDetails>;
}) {
  return [
    'Verification code',
    '',
    'Enter the following verification code when prompted:',
    '',
    otp,
    '',
    'To protect your account, do not share this code.',
    '',
    "Didn't request this?",
    '',
    `This code was requested from ${requestDetails.ip}, ${requestDetails.location} at ${requestDetails.date}, ${requestDetails.time}. If you didn't make this request, you can safely ignore this email.`,
  ].join('\n');
}
