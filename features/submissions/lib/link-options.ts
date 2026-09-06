import type { CoinSubmissionValues } from '@/features/submissions/schemas/coin-submission';

export const socialLinkFields = [
  {
    key: 'telegram' as const,
    icon: 'akar-icons:telegram-fill',
    label: 'Telegram Link',
    placeholder: 'https://t.me/example',
  },
  {
    key: 'x' as const,
    icon: 'akar-icons:x-fill',
    label: 'X Link',
    placeholder: 'https://x.com/example',
  },
  {
    key: 'discord' as const,
    icon: 'akar-icons:discord-fill',
    label: 'Discord Link',
    placeholder: 'https://discord.gg/example',
  },
  {
    key: 'github' as const,
    icon: 'akar-icons:github-fill',
    label: 'GitHub Link',
    placeholder: 'https://github.com/example',
  },
  {
    key: 'whitepaper' as const,
    icon: 'akar-icons:file',
    label: 'Whitepaper Link',
    placeholder: 'https://example.com/whitepaper.pdf',
  },
] satisfies Array<{
  key: keyof Pick<CoinSubmissionValues, 'telegram' | 'x' | 'discord' | 'github' | 'whitepaper'>;
  label: string;
  icon: string;
  placeholder: string;
}>;
