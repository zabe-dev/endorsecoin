import {
  coinSubmissionPayloadSchema,
  type CoinSubmissionPayload,
} from '@/features/submissions/schemas/coin-submission';
import { apiError, apiSuccess } from '@/lib/api/responses';
import { rateLimitError } from '@/lib/api/rate-limit-response';
import { auth } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import {
  coinSubmissionCategories,
  coinSubmissionContracts,
  coinSubmissionLinks,
  coinSubmissions,
} from '@/lib/db/schema';
import { getClientIp } from '@/lib/http/client-ip';
import { buildRequestSubject, consumeRateLimit, oneHourMs } from '@/lib/security/rate-limit';
import { uploadSubmissionLogo } from '@/lib/storage/r2';
import { headers } from 'next/headers';

const maxSubmissionBodyBytes = 3_200_000;

export async function POST(request: Request) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return apiError('AUTH_REQUIRED', 'Sign in required.', 401);

  const contentLength = Number(requestHeaders.get('content-length') || 0);
  if (contentLength > maxSubmissionBodyBytes) {
    return apiError('SUBMISSION_TOO_LARGE', 'Submission is too large.', 413);
  }

  const limiter = await consumeRateLimit({
    action: 'coin-submission.create',
    subject: buildRequestSubject({ requestHeaders, userId: session.user.id }),
    limit: 5,
    windowMs: oneHourMs,
  });

  if (!limiter.allowed) {
    return rateLimitError('', limiter);
  }

  const rawBody = await request.text().catch(() => '');
  if (byteLength(rawBody) > maxSubmissionBodyBytes) {
    return apiError('SUBMISSION_TOO_LARGE', 'Submission is too large.', 413);
  }

  const body = parseJson(rawBody);
  const normalizedBody = normalizeSubmissionRequestBody(body, session.user.email);
  if (!normalizedBody) {
    return apiError(
      'INVALID_SUBMISSION_SHAPE',
      'Submission data is not in the expected format.',
      400,
    );
  }

  const parsed = coinSubmissionPayloadSchema.safeParse(normalizedBody);
  if (!parsed.success) {
    return apiError(
      'INVALID_SUBMISSION',
      parsed.error.issues[0]?.message || 'Invalid submission.',
      400,
    );
  }

  const payload = parsed.data;
  const contactEmail = session.user.email;

  const turnstile = await verifyTurnstile(payload.turnstileToken || '', requestHeaders);
  if (!turnstile.ok) {
    return apiError(
      'TURNSTILE_FAILED',
      turnstile.error || 'Could not verify this submission. Please try again.',
      400,
    );
  }

  const uploadedLogo = await uploadSubmissionLogo({
    ...payload.logo,
    chain: payload.contracts[0]?.chain || 'unknown',
  }).catch(() => null);
  if (!uploadedLogo) {
    return apiError('LOGO_UPLOAD_FAILED', 'Could not upload the logo. Please try again.', 502);
  }

  const createdId = await db.transaction(async (tx) => {
    const [submission] = await tx
      .insert(coinSubmissions)
      .values({
        submittedByUserId: session.user.id,
        requesterEmail: contactEmail,
        requesterTelegram: payload.telegramContact,
        submissionType: 'new-coin',
        status: 'pending',
        coinData: buildSubmissionData(payload, contactEmail, uploadedLogo),
      })
      .returning({ id: coinSubmissions.id });

    if (!submission) throw new Error('Failed to create submission.');

    await tx.insert(coinSubmissionCategories).values(
      payload.categories.map((category) => ({
        submissionId: submission.id,
        category,
      })),
    );

    await tx.insert(coinSubmissionContracts).values(
      payload.contracts.map((contract, index) => ({
        submissionId: submission.id,
        chain: contract.chain,
        contractAddress: contract.address || null,
        isPrimary: index === 0,
        sortOrder: index,
      })),
    );

    const links = buildSubmissionLinks(payload);
    if (links.length) {
      await tx.insert(coinSubmissionLinks).values(
        links.map((link, index) => ({
          submissionId: submission.id,
          kind: link.kind,
          provider: link.provider || null,
          label: link.label || null,
          url: link.url || '',
          sortOrder: index,
        })),
      );
    }

    return submission.id;
  });

  return apiSuccess({ id: createdId }, 'Project submitted for review.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSubmissionRequestBody(body: unknown, email: string) {
  if (!isRecord(body)) return null;
  const basic = isRecord(body.basic) ? body.basic : null;
  const links = isRecord(body.links) ? body.links : null;
  const market = isRecord(body.market) ? body.market : null;
  const security = isRecord(body.security) ? body.security : {};
  const contact = isRecord(body.contact) ? body.contact : {};

  if (!basic || !links || !market) return null;

  const marketType = readString(market.type);
  const contracts = Array.isArray(market.contracts)
    ? market.contracts.map((contract) =>
        isRecord(contract)
          ? {
              chain: readString(contract.chain),
              address: readString(contract.address),
            }
          : { chain: '', address: '' },
      )
    : [];

  const normalized = {
    logo: basic.logo,
    name: readString(basic.name),
    symbol: readString(basic.symbol),
    description: readString(basic.description),
    categories: Array.isArray(basic.categories) ? basic.categories : [],
    isPresale: marketType === 'presale',
    website: readString(links.website),
    telegram: readString(links.telegram),
    x: readString(links.x),
    discord: readString(links.discord),
    github: readString(links.github),
    whitepaper: readString(links.whitepaper),
    contracts,
    launchDate: '',
    chart: { provider: '', customUrl: '' },
    dex: { provider: '', customUrl: '' },
    presale: {
      website: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      paymentToken: '',
      softCap: '',
      hardCap: '',
    },
    kycUrl: readString(security.kycUrl),
    auditUrl: readString(security.auditUrl),
    email,
    telegramContact: readString(contact.telegram),
    agreedToTerms: body.agreedToTerms === true,
    turnstileToken: readString(body.turnstileToken),
  };

  if (marketType === 'launched') {
    const chart = isRecord(market.chart) ? market.chart : {};
    const dex = isRecord(market.dex) ? market.dex : {};
    return {
      ...normalized,
      isPresale: false,
      launchDate: readString(market.launchDate),
      chart: {
        provider: readString(chart.provider),
        customUrl: readString(chart.customUrl),
      },
      dex: {
        provider: readString(dex.provider),
        customUrl: readString(dex.customUrl),
      },
    };
  }

  if (marketType === 'presale') {
    const presale = isRecord(market.presale) ? market.presale : {};
    const start = splitDateTime(readString(presale.startDate));
    const end = splitDateTime(readString(presale.endDate));
    return {
      ...normalized,
      isPresale: true,
      presale: {
        website: readString(presale.website),
        startDate: start.date,
        startTime: start.time,
        endDate: end.date,
        endTime: end.time,
        paymentToken: readString(presale.paymentToken),
        softCap: readString(presale.softCap),
        hardCap: readString(presale.hardCap),
      },
    };
  }

  return null;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function splitDateTime(value: string) {
  const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (isoDate) return { date: isoDate[1], time: isoDate[2] };
  return { date: value, time: '' };
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
    const result = (await response.json().catch(() => null)) as { success?: boolean } | null;
    return result?.success
      ? { ok: true }
      : { ok: false, error: 'Could not verify this submission. Please try again.' };
  } catch {
    return { ok: false, error: 'Could not verify this submission. Please try again.' };
  }
}

function buildSubmissionData(
  payload: CoinSubmissionPayload,
  contactEmail: string,
  uploadedLogo: { key: string; url: string },
) {
  const primaryContract = payload.contracts[0];
  const links = {
    website: payload.website,
    telegram: payload.telegram,
    x: payload.x,
    discord: payload.discord,
    github: payload.github,
    whitepaper: payload.whitepaper,
  };
  const market = payload.isPresale
    ? {
        type: 'presale',
        primaryChain: primaryContract?.chain || '',
        contracts: payload.contracts,
        presale: payload.presale,
      }
    : {
        type: 'launched',
        primaryChain: primaryContract?.chain || '',
        contracts: payload.contracts,
        launchDate: payload.launchDate,
        chart: payload.chart,
        dex: payload.dex,
      };

  return {
    basic: {
      name: payload.name,
      symbol: payload.symbol,
      description: payload.description,
      categories: payload.categories,
      isPresale: payload.isPresale,
      logo: {
        fileName: payload.logo.name,
        mimeType: payload.logo.mimeType,
        width: payload.logo.width,
        height: payload.logo.height,
        key: uploadedLogo.key,
        url: uploadedLogo.url,
      },
    },
    links,
    market,
    security: {
      kycUrl: payload.kycUrl,
      auditUrl: payload.auditUrl,
    },
    contact: {
      email: contactEmail,
      telegram: payload.telegramContact,
    },
  };
}

function buildSubmissionLinks(payload: CoinSubmissionPayload) {
  return [
    { kind: 'website', url: payload.website, label: 'Website' },
    { kind: 'telegram', url: payload.telegram, label: 'Telegram' },
    { kind: 'x', url: payload.x, label: 'X' },
    { kind: 'discord', url: payload.discord, label: 'Discord' },
    { kind: 'github', url: payload.github, label: 'GitHub' },
    { kind: 'whitepaper', url: payload.whitepaper, label: 'Whitepaper' },
    {
      kind: 'chart',
      provider: payload.chart.provider,
      url: payload.chart.customUrl,
      label: 'Chart link',
    },
    {
      kind: 'dex',
      provider: payload.dex.provider,
      url: payload.dex.customUrl,
      label: 'DEX link',
    },
    ...(payload.isPresale
      ? [
          {
            kind: 'presale-website',
            url: payload.presale.website,
            label: 'Presale website',
          },
          {
            kind: 'kyc',
            url: payload.kycUrl,
            label: 'KYC link',
          },
          {
            kind: 'audit',
            url: payload.auditUrl,
            label: 'Audit report',
          },
        ]
      : [
          {
            kind: 'kyc',
            url: payload.kycUrl,
            label: 'KYC link',
          },
          {
            kind: 'audit',
            url: payload.auditUrl,
            label: 'Audit report',
          },
        ]),
  ].filter((link) => Boolean(link.url));
}
