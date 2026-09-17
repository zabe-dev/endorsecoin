'use client';

import { SystemStatePage } from '@/components/layout/system-state-page';
import { useEffect } from 'react';
import './globals.css';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <SystemStatePage code="500" message="Something went wrong while loading EndorseCoin." />
      </body>
    </html>
  );
}
