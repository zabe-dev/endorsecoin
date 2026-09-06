'use client';

import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CoinSubmissionValues } from '@/features/submissions/schemas/coin-submission';
import { loadImage, type LogoDraft } from '@/features/submissions/lib/logo-utils';

export function LogoCropDialog({
  draft,
  onCancel,
  onApply,
}: {
  draft: LogoDraft;
  onCancel: () => void;
  onApply: (logo: CoinSubmissionValues['logo']) => void;
}) {
  const cropRef = useRef<HTMLDivElement>(null);
  const [cropSize, setCropSize] = useState(300);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const update = () => {
      if (!cropRef.current) return;
      const nextSize = cropRef.current.getBoundingClientRect().width;
      const baseScale = Math.max(nextSize / draft.width, nextSize / draft.height);
      const maxX = Math.max(0, (draft.width * baseScale * zoom - nextSize) / 2);
      const maxY = Math.max(0, (draft.height * baseScale * zoom - nextSize) / 2);
      setCropSize(nextSize);
      setOffset((current) => ({
        x: Math.max(-maxX, Math.min(maxX, current.x)),
        y: Math.max(-maxY, Math.min(maxY, current.y)),
      }));
    };
    update();
    const observer = new ResizeObserver(update);
    if (cropRef.current) observer.observe(cropRef.current);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [draft.height, draft.width, zoom]);

  const render = useMemo(() => {
    const baseScale = Math.max(cropSize / draft.width, cropSize / draft.height);
    const scaledWidth = draft.width * baseScale * zoom;
    const scaledHeight = draft.height * baseScale * zoom;
    const maxX = Math.max(0, (scaledWidth - cropSize) / 2);
    const maxY = Math.max(0, (scaledHeight - cropSize) / 2);
    return {
      baseScale,
      scaledWidth,
      scaledHeight,
      clampX: maxX,
      clampY: maxY,
    };
  }, [cropSize, draft.height, draft.width, zoom]);

  function clamp(next: { x: number; y: number }) {
    return {
      x: Math.max(-render.clampX, Math.min(render.clampX, next.x)),
      y: Math.max(-render.clampY, Math.min(render.clampY, next.y)),
    };
  }

  async function applyCrop() {
    const image = await loadImage(draft.dataUrl);
    const targetSize = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const context = canvas.getContext('2d');
    if (!context) return;
    const scale = targetSize / cropSize;
    const drawWidth = render.scaledWidth * scale;
    const drawHeight = render.scaledHeight * scale;
    const drawX = ((cropSize - render.scaledWidth) / 2 + offset.x) * scale;
    const drawY = ((cropSize - render.scaledHeight) / 2 + offset.y) * scale;
    context.clearRect(0, 0, targetSize, targetSize);
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    onApply({
      name: draft.name,
      mimeType: draft.mimeType,
      width: targetSize,
      height: targetSize,
      dataUrl: canvas.toDataURL('image/png'),
    });
  }

  return (
    <div className="submission-modal-backdrop" role="presentation">
      <div className="submission-modal" role="dialog" aria-modal="true" aria-label="Crop logo">
        <div className="submission-modal-head">
          <h3>Crop image</h3>
          <button
            type="button"
            className="submission-modal-close"
            aria-label="Close crop dialog"
            onClick={onCancel}
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="submission-cropper">
          <div
            className={`submission-cropper-stage ${dragging ? 'dragging' : ''}`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
              dragOrigin.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
            }}
            onPointerMove={(event) => {
              if (!dragging || !dragOrigin.current) return;
              setOffset(
                clamp({
                  x: event.clientX - dragOrigin.current.x,
                  y: event.clientY - dragOrigin.current.y,
                }),
              );
            }}
            onPointerUp={() => {
              setDragging(false);
              dragOrigin.current = null;
            }}
            onPointerCancel={() => {
              setDragging(false);
              dragOrigin.current = null;
            }}
          >
            <img
              className="submission-cropper-image"
              src={draft.dataUrl}
              alt=""
              style={{
                left: '50%',
                top: '50%',
                width: `${render.scaledWidth}px`,
                height: `${render.scaledHeight}px`,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
              draggable={false}
            />
            <div className="submission-cropper-shade shade-top" />
            <div className="submission-cropper-shade shade-right" />
            <div className="submission-cropper-shade shade-bottom" />
            <div className="submission-cropper-shade shade-left" />
            <div className="submission-cropper-frame" ref={cropRef}>
              <div className="submission-cropper-grid" />
              <div className="submission-cropper-ring" />
            </div>
          </div>
          <div className="submission-cropper-meta">
            <div className="submission-zoom-control">
              <ZoomOut aria-hidden="true" />
              <input
                aria-label="Logo zoom"
                type="range"
                min="1"
                max="2.5"
                step="0.01"
                value={zoom}
                onChange={(event) => {
                  const nextZoom = Number(event.target.value);
                  const baseScale = Math.max(cropSize / draft.width, cropSize / draft.height);
                  const maxX = Math.max(0, (draft.width * baseScale * nextZoom - cropSize) / 2);
                  const maxY = Math.max(0, (draft.height * baseScale * nextZoom - cropSize) / 2);
                  setOffset((current) => ({
                    x: Math.max(-maxX, Math.min(maxX, current.x)),
                    y: Math.max(-maxY, Math.min(maxY, current.y)),
                  }));
                  setZoom(nextZoom);
                }}
              />
              <ZoomIn aria-hidden="true" />
            </div>

            <div className="submission-crop-help">
              <strong>How to crop your logo</strong>
              <ul>
                <li>Use the slider to zoom in on the area you want.</li>
                <li>Drag the image to reposition it within the frame.</li>
                <li>The square area will be saved as your logo.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="submission-modal-actions">
          <button type="button" className="submission-primary" onClick={() => void applyCrop()}>
            Save image
          </button>
        </div>
      </div>
    </div>
  );
}
