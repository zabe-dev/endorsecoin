'use client';

import { createAuthClient } from 'better-auth/react';
import { adminClient, emailOTPClient } from 'better-auth/client/plugins';
import { identifyAnalyticsUser, resetAnalyticsUser } from '@/lib/analytics/posthog';

export const authClient = createAuthClient({
  plugins: [adminClient(), emailOTPClient()],
});

export function identifyPostHogUser(user: Parameters<typeof identifyAnalyticsUser>[0]) {
  identifyAnalyticsUser(user);
}

export function resetPostHogUser() {
  resetAnalyticsUser();
}
