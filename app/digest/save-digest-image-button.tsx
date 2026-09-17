'use client';

import { Check, Download } from 'lucide-react';
import { toPng } from 'html-to-image';
import { useEffect, useState } from 'react';

export function SaveDigestImageButton({
  targetId,
  filename,
}: {
  targetId: string;
  filename: string;
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  async function saveImage() {
    const target = document.getElementById(targetId);
    if (!target) return;

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
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }

  return (
    <span className="digest-share-actions digest-share-exclude">
      <button
        type="button"
        className="digest-share"
        onClick={() => void saveImage()}
        title="Save card as image"
        aria-label="Save card as image"
      >
        {saved ? <Check aria-hidden="true" /> : <Download aria-hidden="true" />}
        <span>{saved ? 'Saved' : 'Save as image'}</span>
      </button>
    </span>
  );
}
