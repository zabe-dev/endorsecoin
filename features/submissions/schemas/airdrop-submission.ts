import {
  isMatchingSocialUrl,
  socialUrlError,
  type SocialUrlKind,
} from '@/features/submissions/lib/social-url-validation';
import { z } from 'zod';

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value?.trim() || '')
  .refine((value) => !value || /^https?:\/\/.+\..+/i.test(value), 'Enter a valid URL.');

const requiredUrl = z
  .string()
  .trim()
  .min(1, 'This link is required.')
  .refine((value) => /^https?:\/\/.+\..+/i.test(value), 'Enter a valid URL.');

const plainText = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .transform((value) => stripDangerousMarkup(value))
    .pipe(z.string().min(min, message).max(max, message));

const descriptionText = z
  .string()
  .transform((value) => stripDangerousDescription(value))
  .refine((value) => value.trim().length >= 40, 'Description must be at least 40 characters.')
  .refine((value) => value.length <= 500, 'Description must be 500 characters or fewer.');

const dateText = z
  .string()
  .trim()
  .min(1, 'Date is required.')
  .transform((value) => normalizeDateInput(value))
  .refine((value) => isValidDate(value), 'Use a valid date.');

const timeText = z
  .string()
  .trim()
  .min(1, 'Time is required.')
  .refine((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'Use a valid time.');

const socialLinksSchema = z.object({
  telegram: optionalUrl,
  x: optionalUrl,
  reddit: optionalUrl,
  discord: optionalUrl,
  youtube: optionalUrl,
  facebook: optionalUrl,
});

const socialLinkPaths = [
  'telegram',
  'x',
  'reddit',
  'discord',
  'youtube',
  'facebook',
] as const satisfies readonly SocialUrlKind[];

export const airdropSubmissionSchema = z
  .object({
    name: plainText(4, 80, 'Airdrop name must be 4–80 characters.'),
    claimRewardsUrl: requiredUrl,
    coinId: z.coerce.number().int().positive('Select an approved project.'),
    description: descriptionText,
    rewards: plainText(2, 160, 'Rewards are required.'),
    winnersCount: z.coerce
      .number({ error: 'Number of winners is required.' })
      .int('Number of winners must be a whole number.')
      .positive('Number of winners must be greater than zero.')
      .max(10_000_000, 'Number of winners is too high.'),
    startDate: dateText,
    startTime: timeText,
    endDate: dateText,
    endTime: timeText,
    website: requiredUrl,
    socialLinks: socialLinksSchema,
    agreedToTerms: z.boolean(),
    turnstileToken: z.string().trim().optional().or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    if (!value.agreedToTerms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'You must agree to the terms and conditions.',
        path: ['agreedToTerms'],
      });
    }

    socialLinkPaths.forEach((path) => {
      if (!isMatchingSocialUrl(value.socialLinks[path], path)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: socialUrlError(path),
          path: ['socialLinks', path],
        });
      }
    });

    const startsAt = toUtcDate(value.startDate, value.startTime);
    const endsAt = toUtcDate(value.endDate, value.endTime);
    if (startsAt && endsAt && endsAt <= startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date and time must be after the start date and time.',
        path: ['endDate'],
      });
    }
  });

export const airdropSubmissionPayloadSchema = airdropSubmissionSchema.transform((value) => ({
  ...value,
  startsAt: toUtcIso(value.startDate, value.startTime),
  endsAt: toUtcIso(value.endDate, value.endTime),
}));

export type AirdropSubmissionValues = z.input<typeof airdropSubmissionSchema>;
export type AirdropSubmissionPayload = z.output<typeof airdropSubmissionPayloadSchema>;

export const airdropSocialLinkFields = [
  {
    key: 'telegram' as const,
    icon: 'akar-icons:telegram-fill',
    label: 'Telegram',
    placeholder: 'https://t.me/project',
  },
  {
    key: 'x' as const,
    icon: 'akar-icons:x-fill',
    label: 'X / Twitter',
    placeholder: 'https://x.com/project',
  },
  {
    key: 'reddit' as const,
    icon: 'akar-icons:reddit-fill',
    label: 'Reddit',
    placeholder: 'https://reddit.com/r/project',
  },
  {
    key: 'discord' as const,
    icon: 'akar-icons:discord-fill',
    label: 'Discord',
    placeholder: 'https://discord.gg/project',
  },
  {
    key: 'youtube' as const,
    icon: 'akar-icons:youtube-fill',
    label: 'YouTube',
    placeholder: 'https://youtube.com/@project',
  },
  {
    key: 'facebook' as const,
    icon: 'akar-icons:facebook-fill',
    label: 'Facebook',
    placeholder: 'https://facebook.com/project',
  },
] satisfies Array<{
  key: keyof AirdropSubmissionValues['socialLinks'];
  label: string;
  icon: string;
  placeholder: string;
}>;

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

function normalizeDateInput(value: string) {
  const trimmedValue = value.trim();
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

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function toUtcDate(date: string, time: string) {
  const normalizedDate = normalizeDateInput(date);
  if (!isValidDate(normalizedDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return new Date(`${normalizedDate}T${time}:00Z`);
}

function toUtcIso(date: string, time: string) {
  return toUtcDate(date, time)?.toISOString() || '';
}
