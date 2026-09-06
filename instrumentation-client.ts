import posthog from 'posthog-js';

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: '2026-01-30',
    capture_exceptions: true,
    capture_pageview: 'history_change',
    debug: process.env.NODE_ENV === 'development',
  });
}
