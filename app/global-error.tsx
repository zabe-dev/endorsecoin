'use client';

import { SystemStatePage } from '@/components/layout/system-state-page';
import { captureError } from '@/lib/analytics/posthog';
import { OctagonAlert } from 'lucide-react';
import { useEffect } from 'react';
import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    captureError(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <SystemStatePage
          eyebrow="Critical error"
          title="EndorseCoin needs a refresh."
          description="A root-level error interrupted the app. Try reloading the page, or return home and continue from there."
          icon={<OctagonAlert aria-hidden="true" />}
          secondaryLabel="Try again"
          onSecondaryClick={reset}
        />
      </body>
    </html>
  );
}
