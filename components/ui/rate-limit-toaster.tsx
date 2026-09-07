'use client';

import { Toaster } from 'sonner';

export function RateLimitToaster() {
  return (
    <Toaster
      position="top-right"
      closeButton={false}
      richColors={false}
      theme="dark"
      toastOptions={{
        style: {
          background: '#0d1013',
          border: '1px solid #333a3f',
          color: '#f2f4f5',
          boxShadow: '0 14px 34px rgba(0, 0, 0, 0.32)',
        },
        classNames: {
          toast: 'endorsecoin-toast',
          title: 'endorsecoin-toast-title',
          description: 'endorsecoin-toast-description',
          closeButton: 'endorsecoin-toast-close',
        },
      }}
    />
  );
}
