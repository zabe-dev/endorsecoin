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
    const exportHost = document.createElement('div');
    const exportTarget = target.cloneNode(true) as HTMLElement;
    exportHost.style.position = 'fixed';
    exportHost.style.top = '0';
    exportHost.style.left = '-100000px';
    exportHost.style.width = '760px';
    exportHost.style.pointerEvents = 'none';
    exportTarget.classList.add('digest-exporting');
    exportHost.appendChild(exportTarget);
    document.body.appendChild(exportHost);
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(exportTarget.querySelectorAll('img')).map(waitForImage));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const bounds = exportTarget.getBoundingClientRect();
      const dataUrl = await toPng(exportTarget, {
        backgroundColor: '#0e1114',
        cacheBust: true,
        filter: (node) => !node.classList?.contains('digest-action-exclude'),
        height: Math.ceil(bounds.height),
        pixelRatio: 2,
        width: Math.ceil(bounds.width),
      });
      const paddedDataUrl = await addImagePadding(dataUrl, 16 * 2);
      const link = document.createElement('a');
      link.download = filename;
      link.href = paddedDataUrl;
      link.click();
      setState('saved');
    } catch {
      setState('idle');
    } finally {
      exportHost.remove();
    }
  }

  return (
    <span className="digest-action-group digest-action-exclude">
      <button
        type="button"
        className="digest-action digest-save-image-button"
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

async function waitForImage(image: HTMLImageElement) {
  if (!image.complete) {
    await new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    });
  }
  await image.decode().catch(() => undefined);
}

function addImagePadding(dataUrl: string, padding: number) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth + padding * 2;
      canvas.height = image.naturalHeight + padding * 2;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Could not prepare image canvas.'));
        return;
      }
      context.fillStyle = '#0e1114';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, padding, padding);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('Could not prepare image.'));
    image.src = dataUrl;
  });
}
