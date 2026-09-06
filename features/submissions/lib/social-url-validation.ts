export const socialUrlRules = {
  telegram: {
    label: 'Telegram',
    hosts: ['t.me', 'telegram.org', 'telegram.me', 'telegram.dog'],
  },
  x: {
    label: 'X / Twitter',
    hosts: ['x.com', 'twitter.com'],
  },
  reddit: {
    label: 'Reddit',
    hosts: ['reddit.com'],
  },
  discord: {
    label: 'Discord',
    hosts: ['discord.gg', 'discord.com'],
  },
  youtube: {
    label: 'YouTube',
    hosts: ['youtube.com', 'youtu.be'],
  },
  facebook: {
    label: 'Facebook',
    hosts: ['facebook.com', 'fb.com', 'fb.me'],
  },
  github: {
    label: 'GitHub',
    hosts: ['github.com'],
  },
} as const;

export type SocialUrlKind = keyof typeof socialUrlRules;

export function isMatchingSocialUrl(value: string, kind: SocialUrlKind) {
  if (!value) return true;

  try {
    const url = new URL(value);
    const host = normalizeHost(url.hostname);
    return socialUrlRules[kind].hosts.some(
      (allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`),
    );
  } catch {
    return false;
  }
}

export function socialUrlError(kind: SocialUrlKind) {
  return `Enter a valid ${socialUrlRules[kind].label} link.`;
}

function normalizeHost(host: string) {
  return host.toLowerCase().replace(/^(www\.|m\.)/, '');
}
