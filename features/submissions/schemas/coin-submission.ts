import { SUPPORTED_NETWORK_IDS } from '@/features/coins/networks';
import { providerOptions } from '@/features/submissions/lib/market-options';
import { z } from 'zod';

export const submissionCategories = [
  {
    value: 'AI',
    label: 'Artificial Intelligence',
  },
  { value: 'DeFi', label: 'DeFi' },
  { value: 'Fan Token', label: 'Fan Token' },
  { value: 'Gambling', label: 'Gambling' },
  { value: 'Gaming', label: 'Gaming' },
  { value: 'Memecoins', label: 'Memecoins' },
  { value: 'NFT Platform', label: 'NFT Platform' },
  { value: 'Other', label: 'Other' },
  { value: 'Play To Earn', label: 'Play To Earn' },
  { value: 'Pump.fun Tokens', label: 'Pump.fun Tokens' },
  { value: 'Utility Token', label: 'Utility Token' },
] as const;

export const submissionCategoryValues = submissionCategories.map((category) => category.value) as [
  SubmissionCategory,
  ...SubmissionCategory[],
];

export const submissionPaymentTokens = ['USDT', 'BUSD', 'BNB', 'ETH', 'SOL'] as const;

export const submissionNetworks = [...SUPPORTED_NETWORK_IDS, 'other'] as const;

export type SubmissionCategory = (typeof submissionCategories)[number]['value'];
export type SubmissionNetwork = (typeof submissionNetworks)[number];
export type SubmissionPaymentToken = (typeof submissionPaymentTokens)[number];

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value?.trim() || '')
  .refine((value) => !value || /^https?:\/\/.+\..+/i.test(value), 'Enter a valid URL.');

const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value?.trim() || '');

const plainText = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .transform((value) => stripDangerousMarkup(value))
    .pipe(z.string().min(min, message).max(max, message));

const descriptionText = (min: number, max: number, message: string) =>
  z
    .string()
    .transform((value) => stripDangerousDescription(value))
    .refine((value) => value.trim().length >= min, message)
    .refine((value) => value.length <= max, message);

const symbolText = z
  .string()
  .trim()
  .transform((value) => stripDangerousMarkup(value).replace(/^\$/, '').toUpperCase())
  .pipe(z.string().min(1, 'Symbol is required.').max(8, 'Symbol must be 8 characters or fewer.'));

const networkSchema = z.enum(submissionNetworks);
const dateText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => normalizeDateInput(value || ''))
  .refine((value) => !value || isValidDate(value), 'Use a valid date.');
const timeText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || '')
  .refine((value) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'Use a valid time.');

const logoSchema = z.object({
  name: z.string().trim().min(1, 'Choose a logo file.'),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  width: z.number().int().min(100, 'Logo must be at least 100px by 100px.'),
  height: z.number().int().min(100, 'Logo must be at least 100px by 100px.'),
  dataUrl: z
    .string()
    .trim()
    .min(1, 'Choose a logo file.')
    .max(2_800_000, 'Logo file is too large.')
    .refine(
      (value) => /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value),
      'Upload a PNG, JPG, JPEG, or WEBP logo.',
    ),
});

const contactSchema = z.object({
  email: z.string().trim().email('Use a valid contact email.'),
  telegramContact: z.string().trim().min(2, 'Contact Telegram is required.'),
  agreedToTerms: z.boolean(),
  turnstileToken: z.string().trim().optional().or(z.literal('')),
});

const linkSchema = z.object({
  website: optionalUrl,
  telegram: optionalUrl,
  x: optionalUrl,
  discord: optionalUrl,
  github: optionalUrl,
  whitepaper: optionalUrl,
});

const contractSchema = z.object({
  chain: networkSchema.or(z.literal('')),
  address: optionalText,
});

const marketSchema = z.object({
  contracts: z.array(contractSchema).min(1, 'Add at least one chain row.'),
  launchDate: dateText,
  chart: z.object({
    provider: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .transform((value) => value || ''),
    customUrl: optionalUrl,
  }),
  dex: z.object({
    provider: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .transform((value) => value || ''),
    customUrl: optionalUrl,
  }),
  presale: z.object({
    website: optionalUrl,
    startDate: dateText,
    startTime: timeText,
    endDate: dateText,
    endTime: timeText,
    paymentToken: z
      .enum(submissionPaymentTokens)
      .optional()
      .or(z.literal(''))
      .transform((value) => value || ''),
    softCap: optionalText,
    hardCap: optionalText,
  }),
});

const securitySchema = z.object({
  kycUrl: optionalUrl,
  auditUrl: optionalUrl,
});

export const submissionBasicsSchema = z.object({
  logo: logoSchema,
  name: plainText(4, 40, 'Coin name must be 4–40 characters.'),
  symbol: symbolText,
  description: descriptionText(60, 320, 'Description must be 60–320 characters.'),
  categories: z
    .array(z.enum(submissionCategoryValues))
    .min(1, 'Choose at least one category.')
    .max(3, 'Choose up to 3 categories.'),
  isPresale: z.boolean(),
});

export const submissionLinksSchema = linkSchema.refine((value) => Boolean(value.website), {
  message: 'Website link is required.',
  path: ['website'],
});

export const submissionMarketSchema = marketSchema;

export const submissionSecuritySchema = securitySchema;

export const submissionContactSchema = contactSchema.superRefine((value, ctx) => {
  if (!value.agreedToTerms) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'You must agree to the terms and conditions.',
      path: ['agreedToTerms'],
    });
  }
});

export const coinSubmissionSchema = z
  .object({
    ...submissionBasicsSchema.shape,
    ...linkSchema.shape,
    ...marketSchema.shape,
    ...securitySchema.shape,
    ...contactSchema.shape,
  })
  .superRefine((value, ctx) => {
    const firstContract = value.contracts[0];

    if (!value.website) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Website link is required.',
        path: ['website'],
      });
    }

    if (!firstContract?.chain) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a primary chain.',
        path: ['contracts', 0, 'chain'],
      });
    }

    value.contracts.forEach((contract, index) => {
      if (!contract.chain) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Chain is required.',
          path: ['contracts', index, 'chain'],
        });
      }

      if (!value.isPresale && !contract.address?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Contract address is required.',
          path: ['contracts', index, 'address'],
        });
      }
    });

    if (!value.agreedToTerms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'You must agree to the terms and conditions.',
        path: ['agreedToTerms'],
      });
    }

    if (!value.isPresale && !value.launchDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Launch date is required for launched coins.',
        path: ['launchDate'],
      });
    }

    if (value.isPresale) {
      if (
        value.chart.provider ||
        value.chart.customUrl ||
        value.dex.provider ||
        value.dex.customUrl
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Chart and DEX links are only used for launched coins.',
          path: ['chart', 'provider'],
        });
      }

      if (!value.presale.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Presale start date is required.',
          path: ['presale', 'startDate'],
        });
      }
      if (!value.presale.startTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Presale start time is required.',
          path: ['presale', 'startTime'],
        });
      }
      if (!value.presale.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Presale end date is required.',
          path: ['presale', 'endDate'],
        });
      }
      if (!value.presale.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Presale end time is required.',
          path: ['presale', 'endTime'],
        });
      }
      if (!value.presale.paymentToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Select a presale payment token.',
          path: ['presale', 'paymentToken'],
        });
      }
    } else {
      validateProvider('chart', firstContract?.chain || 'ethereum', value.chart, ctx);
      validateProvider('dex', firstContract?.chain || 'ethereum', value.dex, ctx);
    }
  });

export const coinSubmissionPayloadSchema = coinSubmissionSchema.transform((value) => {
  const { startTime, endTime, ...presale } = value.presale;
  const contracts = value.contracts.filter(
    (contract, index) => index === 0 || Boolean(contract.chain || contract.address.trim()),
  );

  if (!value.isPresale) {
    return {
      ...value,
      contracts,
      presale: {
        website: '',
        startDate: '',
        endDate: '',
        paymentToken: '',
        softCap: '',
        hardCap: '',
      },
    };
  }

  return {
    ...value,
    contracts,
    launchDate: '',
    chart: { provider: '', customUrl: '' },
    dex: { provider: '', customUrl: '' },
    presale: {
      ...presale,
      startDate:
        presale.startDate && startTime ? toUtcIso(presale.startDate, startTime) : presale.startDate,
      endDate: presale.endDate && endTime ? toUtcIso(presale.endDate, endTime) : presale.endDate,
    },
  };
});

export type CoinSubmissionValues = z.input<typeof coinSubmissionSchema>;
export type CoinSubmissionPayload = z.output<typeof coinSubmissionPayloadSchema>;

function stripDangerousMarkup(value: string) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/[<>`$]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripDangerousDescription(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z][\w-]*);/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/[<>`]/g, '');
}

function validateProvider(
  kind: 'chart' | 'dex',
  chain: SubmissionNetwork,
  value: { provider: string; customUrl: string },
  ctx: z.RefinementCtx,
) {
  if (!value.provider) return;
  const allowed = providerOptions(kind, chain).some((option) => option.value === value.provider);
  const path = [kind, 'provider'];

  if (!allowed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Select a valid ${kind === 'chart' ? 'chart' : 'DEX'} option for this chain.`,
      path,
    });
  }

  if (value.provider === 'custom' && !value.customUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Custom ${kind === 'chart' ? 'Chart' : 'DEX'} Link is required.`,
      path: [kind, 'customUrl'],
    });
  }
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function normalizeDateInput(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) return trimmedValue;

  const isoDate = trimmedValue.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
  if (isoDate) return isoDate[1];

  const slashDate = trimmedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slashDate) return trimmedValue;

  const month = Number(slashDate[1]);
  const day = Number(slashDate[2]);
  const year = Number(slashDate[3]);
  const normalized = `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

  return isValidDate(normalized) ? normalized : trimmedValue;
}

function toUtcIso(date: string, time: string) {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${normalizedTime}Z`).toISOString();
}
