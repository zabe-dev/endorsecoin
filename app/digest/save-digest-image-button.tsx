'use client';

import { Check, Download } from 'lucide-react';
import { toPng } from 'html-to-image';
import { useEffect, useState } from 'react';

type SaveState = 'idle' | 'saving' | 'saved';
const saveCooldownMs = 2_000;

export function SaveDigestImageButton({
  targetId,
  filename,
}: {
  targetId: string;
  filename: string;
}) {
  const [state, setState] = useState<SaveState>('idle');

  useEffect(() => {
    if (state !== 'saved') return;
    const timeout = window.setTimeout(() => setState('idle'), saveCooldownMs);
    return () => window.clearTimeout(timeout);
  }, [state]);

  async function saveImage() {
    const target = document.getElementById(targetId);
    if (!target || state === 'saving') return;

    setState('saving');
    try {
      const dataUrl = await toPng(target, {
        backgroundColor: '#0e1114',
        cacheBust: true,
        filter: (node) => !node.classList?.contains('digest-share-exclude'),
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
      setState('saved');
    } catch {
      setState('idle');
    }
  }

  return (
    <span className="digest-share-actions digest-share-exclude">
      <button
        type="button"
        className="digest-share"
        onClick={() => void saveImage()}
        disabled={state !== 'idle'}
        title="Save card as image"
        aria-label="Save card as image"
      >
        {state === 'saved' ? <Check aria-hidden="true" /> : <Download aria-hidden="true" />}
        <span>
          {state === 'saving' ? 'Saving...' : state === 'saved' ? 'Saved' : 'Save as image'}
        </span>
      </button>
    </span>
  );
}
