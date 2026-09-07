'use client';

import { ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { PopoverController } from '../types';

export function ConfirmAction({
  popover,
  popoverId,
  action,
  title,
  tone,
  message,
  fields,
  reasonName,
  reasonPlaceholder,
  extra,
  disabled,
  triggerClassName,
  validate,
  children,
}: {
  popover: PopoverController;
  popoverId: string;
  action: (formData: FormData) => Promise<void>;
  title: string;
  tone: 'neutral' | 'success' | 'danger' | 'boost';
  message: string;
  fields: Record<string, string | number>;
  reasonName?: string;
  reasonPlaceholder?: string;
  extra?: ReactNode;
  disabled?: boolean;
  triggerClassName?: string;
  validate?: (formData: FormData) => string | null;
  children: ReactNode;
}) {
  const open = popover.activePopoverId === popoverId;
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverPosition = usePopoverPosition(open, buttonRef);
  const confirmLabel =
    status === 'saving' ? 'Saving...' : status === 'success' ? 'Saved' : 'Confirm';

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  return (
    <span className="admin-confirm-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={triggerClassName || `admin-icon-button ${tone}`}
        title={title}
        aria-label={title}
        disabled={disabled || isPending}
        onClick={() => {
          setFeedback('');
          setStatus('idle');
          popover.setActivePopoverId(open ? null : popoverId);
        }}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <form
            className="admin-confirm-popover"
            style={popoverPosition}
            aria-busy={status === 'saving'}
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const validationMessage = validate?.(formData);
              if (validationMessage) {
                setStatus('error');
                setFeedback(validationMessage);
                return;
              }
              startTransition(async () => {
                setStatus('saving');
                setFeedback('Saving changes...');
                try {
                  await action(formData);
                  setStatus('success');
                  setFeedback('Saved. Refreshing...');
                  successTimerRef.current = setTimeout(() => {
                    popover.setActivePopoverId(null);
                    router.refresh();
                  }, 450);
                } catch (error) {
                  setStatus('error');
                  setFeedback(error instanceof Error ? error.message : 'Could not save changes.');
                }
              });
            }}
          >
            <strong>{title}</strong>
            <p>{message}</p>
            {Object.entries(fields).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            {reasonName && (
              <label>
                Reason
                <textarea name={reasonName} required placeholder={reasonPlaceholder} />
              </label>
            )}
            {extra}
            <div className="admin-confirm-actions">
              <button
                type="submit"
                className={`admin-confirm-submit ${status}`}
                disabled={isPending || status === 'saving' || status === 'success'}
              >
                {status === 'saving' && (
                  <span className="admin-button-spinner" aria-hidden="true" />
                )}
                {confirmLabel}
              </button>
              <button
                type="button"
                className="admin-confirm-cancel"
                disabled={isPending || status === 'saving' || status === 'success'}
                onClick={() => {
                  setStatus('idle');
                  setFeedback('');
                  popover.setActivePopoverId(null);
                }}
              >
                Cancel
              </button>
            </div>
            {feedback && <small className={`admin-confirm-feedback ${status}`}>{feedback}</small>}
          </form>,
          document.body,
        )}
    </span>
  );
}

export function LogoUrlAction({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  if (!logoUrl) return <span className="admin-empty-cell">—</span>;

  return (
    <a
      className="admin-icon-button neutral"
      href={logoUrl}
      target="_blank"
      rel="noreferrer"
      title={`Open ${name} logo`}
      aria-label={`Open ${name} logo`}
    >
      <ExternalLink aria-hidden="true" />
    </a>
  );
}

export function CoinPageLinkAction({ coinId, name }: { coinId: number; name: string }) {
  return (
    <a
      className="admin-icon-button neutral"
      href={`/coin/${coinId}`}
      target="_blank"
      rel="noreferrer"
      title={`Open ${name} coin page`}
      aria-label={`Open ${name} coin page`}
    >
      <ExternalLink aria-hidden="true" />
    </a>
  );
}

function usePopoverPosition(open: boolean, buttonRef: RefObject<HTMLButtonElement | null>) {
  const [position, setPosition] = useState<CSSProperties>({
    position: 'fixed',
    top: '50%',
    left: '50%',
    width: 'min(420px, calc(100vw - 32px))',
    opacity: 0,
    pointerEvents: 'none',
    transform: 'translate(-50%, -50%)',
  });

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const width = Math.min(420, window.innerWidth - 32);
      const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16);
      const gap = 10;
      const viewportPadding = 16;
      const availableBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
      const availableAbove = rect.top - gap - viewportPadding;
      const minUsefulHeight = 260;
      const viewportMaxHeight = Math.max(160, window.innerHeight - viewportPadding * 2);
      const clampPopoverHeight = (availableSpace: number) =>
        Math.max(160, Math.min(viewportMaxHeight, availableSpace));
      const nextPosition: CSSProperties = {
        position: 'fixed',
        width,
        left,
        maxHeight: viewportMaxHeight,
        opacity: 1,
        pointerEvents: 'auto',
      };

      if (availableBelow >= minUsefulHeight || availableBelow >= availableAbove) {
        nextPosition.top = Math.min(rect.bottom + gap, window.innerHeight - viewportPadding);
        nextPosition.maxHeight = clampPopoverHeight(availableBelow);
      } else {
        nextPosition.bottom = Math.min(
          window.innerHeight - rect.top + gap,
          window.innerHeight - viewportPadding,
        );
        nextPosition.maxHeight = clampPopoverHeight(availableAbove);
      }

      setPosition(nextPosition);
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [buttonRef, open]);

  return position;
}
