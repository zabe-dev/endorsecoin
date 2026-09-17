'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ShareDigestButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="digest-share-actions">
      <button
        type="button"
        className="digest-share"
        onClick={() => void copyLink()}
        title="Copy digest link"
        aria-label="Copy digest link"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span>Copy link</span>
      </button>
    </span>
  );
}
