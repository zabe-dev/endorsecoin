'use client';

import { SystemStatePage } from '@/components/layout/system-state-page';
import { useEffect } from 'react';

export default function Error({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <SystemStatePage code="500" message="Something went wrong while loading this page." />;
}
