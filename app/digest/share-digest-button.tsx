'use client';

import { Check, Copy, Send } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ShareDigestButton({
  label,
  telegramText,
  url,
}: {
  label: string;
  telegramText: string;
  url?: string;
}) {
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!shared) return;
    const timeout = window.setTimeout(() => setShared(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [shared]);

  async function copyLink() {
    const nextShareUrl = url ? new URL(url, window.location.origin).toString() : window.location.href;
    try {
      await navigator.clipboard.writeText(nextShareUrl);
      setShared(true);
    } catch {
      setShared(false);
    }
  }

  function shareToTelegram() {
    const shareUrl = url ? new URL(url, window.location.origin).toString() : window.location.href;
    const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(telegramText)}`;
    window.open(telegramHref, '_blank', 'noopener,noreferrer');
  }

  return (
    <span className="digest-share-actions">
      <button
        type="button"
        className="digest-share"
        onClick={() => void copyLink()}
        title={label}
        aria-label={label}
      >
        {shared ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span>{shared ? 'Copied' : 'Copy link'}</span>
      </button>
      <a
        className="digest-share digest-share-telegram"
        href="#"
        onClick={(event) => {
          event.preventDefault();
          shareToTelegram();
        }}
      >
        <Send aria-hidden="true" />
        <span>Telegram</span>
      </a>
    </span>
  );
}
