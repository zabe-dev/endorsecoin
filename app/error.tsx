'use client';

import { SystemStatePage } from '@/components/layout/system-state-page';
import { TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <SystemStatePage
      eyebrow="Something broke"
      title="The page hit a snag."
      description="Something went wrong while loading this part of EndorseCoin. You can try again or head back home."
      icon={<TriangleAlert aria-hidden="true" />}
      secondaryLabel="Try again"
      onSecondaryClick={reset}
    />
  );
}
