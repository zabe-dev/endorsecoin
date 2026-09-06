'use client';

import posthog from 'posthog-js';

type EventProperties = Record<string, string | number | boolean | null | undefined>;

type AnalyticsUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
};

export function isPostHogEnabled() {
  return Boolean(
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST,
  );
}

export function captureEvent(name: string, properties?: EventProperties) {
  if (!isPostHogEnabled()) return;
  posthog.capture(name, properties);
}

export function captureError(error: Error) {
  if (!isPostHogEnabled()) return;
  posthog.captureException(error);
}

export function identifyAnalyticsUser(user: AnalyticsUser) {
  if (!user.id || !isPostHogEnabled()) return;

  posthog.identify(user.id, {
    email: user.email,
    name: user.name,
    role: user.role,
  });
}

export function resetAnalyticsUser() {
  if (!isPostHogEnabled()) return;
  posthog.reset();
}
