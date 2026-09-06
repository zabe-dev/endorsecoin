'use client';

import { NETWORKS } from '@/features/coins/networks';
import type { ReviewSection } from '@/features/submissions/lib/review-sections';
import {
  submissionNetworks,
  type CoinSubmissionValues,
  type SubmissionCategory,
  type SubmissionNetwork,
} from '@/features/submissions/schemas/coin-submission';
import { Icon } from '@iconify/react';
import {
  BrainCircuit,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Dice6,
  FileText,
  Gamepad2,
  Image,
  Landmark,
  Rocket,
  SmilePlus,
  Trophy,
  Upload,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const categoryButtons = [
  { value: 'AI', label: 'Artificial Intelligence', icon: BrainCircuit },
  { value: 'DeFi', label: 'DeFi', icon: Landmark },
  { value: 'Fan Token', label: 'Fan Token', icon: Users },
  { value: 'Gambling', label: 'Gambling', icon: Dice6 },
  { value: 'Gaming', label: 'Gaming', icon: Gamepad2 },
  { value: 'Memecoins', label: 'Memecoins', icon: SmilePlus },
  { value: 'NFT Platform', label: 'NFT Platform', icon: Image },
  { value: 'Other', label: 'Other', icon: CircleHelp },
  { value: 'Play To Earn', label: 'Play To Earn', icon: Trophy },
  { value: 'Pump.fun Tokens', label: 'Pump.fun Tokens', icon: Rocket },
  { value: 'Utility Token', label: 'Utility Token', icon: Wrench },
] as const satisfies Array<{ value: SubmissionCategory; label: string; icon: LucideIcon }>;

export function RequiredMark() {
  return (
    <span className="submission-required" aria-label="required">
      *
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? 'submission-field wide' : 'submission-field'}>
      <span>
        <span>
          {label} {required && <RequiredMark />}
        </span>
        {hint && <small>{hint}</small>}
      </span>
      {children}
      {error && <small className="submission-inline-error">{error}</small>}
    </label>
  );
}

export function LogoField({
  value,
  draftError,
  error,
  onSelect,
  onOpenCrop,
  onRemove,
}: {
  value: CoinSubmissionValues['logo'];
  draftError: string;
  error?: string;
  onSelect: (file: File) => void;
  onOpenCrop: () => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasLogo = Boolean(value.dataUrl);
  const hasError = Boolean(error || draftError);
  return (
    <div className="submission-field submission-logo-field">
      <span>
        <span>
          Logo <RequiredMark />
        </span>
      </span>
      <div
        className={`submission-dropzone ${hasLogo ? 'has-logo' : ''} ${hasError ? 'has-error' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) onSelect(file);
        }}
      >
        {hasLogo ? (
          <>
            <img src={value.dataUrl} alt="" />
            <button
              type="button"
              className="submission-logo-remove"
              aria-label="Remove logo"
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
            >
              <X aria-hidden="true" />
            </button>
            <button
              type="button"
              className="submission-logo-edit"
              onClick={(event) => {
                event.stopPropagation();
                onOpenCrop();
              }}
            >
              <FileText aria-hidden="true" />
              Edit
            </button>
          </>
        ) : (
          <>
            <Upload aria-hidden="true" />
            <div className="submission-dropzone-text">
              <strong>Upload logo</strong>
              <small>Drop a file or browse</small>
              <small>PNG, JPG, JPEG, or WEBP</small>
              <small>100px × 100px</small>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onSelect(file);
            event.currentTarget.value = '';
          }}
        />
      </div>
      {(error || draftError) && (
        <small className="submission-inline-error">{error || draftError}</small>
      )}
    </div>
  );
}

export function CategoryField({
  selected,
  error,
  onToggle,
}: {
  selected: SubmissionCategory[];
  error?: string;
  onToggle: (category: SubmissionCategory) => void;
}) {
  return (
    <div className="submission-field wide">
      <span>
        <span>
          Categories <RequiredMark />
        </span>
      </span>
      <small className="submission-field-help">Select up to 3 categories.</small>
      <div className="submission-chip-grid">
        {categoryButtons.map((category) => {
          const active = selected.includes(category.value);
          const Icon = category.icon;
          return (
            <button
              key={category.value}
              type="button"
              className={`submission-chip ${active ? 'active' : ''}`}
              onClick={() => onToggle(category.value)}
            >
              <Icon aria-hidden="true" />
              <span>{category.label}</span>
              {active ? <X aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      {error && <small className="submission-inline-error">{error}</small>}
    </div>
  );
}

export function PresaleToggle({
  value,
  error,
  onChange,
}: {
  value: boolean;
  error?: string;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <div className="submission-field wide">
      <span>
        <span>
          Is your project in presale right now? <RequiredMark />
        </span>
      </span>
      <div className="submission-radio-row">
        <button type="button" className={!value ? 'active' : ''} onClick={() => onChange(false)}>
          No
        </button>
        <button type="button" className={value ? 'active' : ''} onClick={() => onChange(true)}>
          Yes
        </button>
      </div>
      {error && <small className="submission-inline-error">{error}</small>}
    </div>
  );
}

export function SectionCard({ children }: { children: React.ReactNode }) {
  return <section className="submission-step-section">{children}</section>;
}

export function LinkField({
  icon,
  label,
  value,
  placeholder,
  error,
  required,
  onChange,
}: {
  icon: string;
  label: string;
  value: string;
  placeholder: string;
  error?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const FieldIcon = icon;
  return (
    <Field label={label} error={error} required={required}>
      <span className="submission-icon-input">
        <Icon icon={FieldIcon} aria-hidden="true" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </span>
    </Field>
  );
}

export function IconTextField({
  icon,
  label,
  value,
  placeholder,
  error,
  required,
  readOnly,
  onChange,
}: {
  icon: string;
  label: string;
  value: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <Field label={label} error={error} required={required}>
      <span className="submission-icon-input">
        <Icon icon={icon} aria-hidden="true" />
        <input
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          onChange={(event) => onChange?.(event.target.value)}
        />
      </span>
    </Field>
  );
}

export function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const selectedDate = parseSubmissionDate(value);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(selectedDate || fallbackDate),
  );
  const calendarDays = getCalendarDays(visibleMonth);

  useEffect(() => {
    if (!open) return;

    function closeCalendar(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('mousedown', closeCalendar);
    return () => document.removeEventListener('mousedown', closeCalendar);
  }, [open]);

  function openCalendar() {
    if (selectedDate) setVisibleMonth(startOfMonth(selectedDate));
    setOpen(true);
  }

  return (
    <span className="submission-date-input" ref={rootRef}>
      <input
        type="text"
        inputMode="numeric"
        value={formatDateForField(value)}
        placeholder="01/13/2009"
        onFocus={openCalendar}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      />
      <button
        type="button"
        aria-label="Open calendar"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          openCalendar();
        }}
      >
        <Icon icon="lucide:calendar-days" aria-hidden="true" />
      </button>
      {open && (
        <span className="submission-calendar" role="dialog" aria-label="Choose date">
          <span className="submission-calendar-head">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <strong>
              {visibleMonth.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </span>
          <span className="submission-calendar-weekdays" aria-hidden="true">
            {weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </span>
          <span className="submission-calendar-grid">
            {calendarDays.map((day) => {
              const selected = selectedDate ? isSameUtcDay(day.date, selectedDate) : false;
              return (
                <button
                  key={day.key}
                  type="button"
                  className={`${!day.inMonth ? 'muted' : ''} ${selected ? 'selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(formatDateForField(day.date));
                    setVisibleMonth(startOfMonth(day.date));
                    setOpen(false);
                  }}
                >
                  {day.date.getUTCDate()}
                </button>
              );
            })}
          </span>
        </span>
      )}
    </span>
  );
}

const fallbackDate = new Date(Date.UTC(2009, 0, 13));
const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseSubmissionDate(value: string) {
  const trimmedValue = value.trim();
  const isoDate = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const slashDate = trimmedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (isoDate) {
    return buildUtcDate(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));
  }

  if (slashDate) {
    return buildUtcDate(Number(slashDate[3]), Number(slashDate[1]), Number(slashDate[2]));
  }

  return null;
}

function buildUtcDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;

  return valid ? date : null;
}

function formatDateForField(value: string | Date) {
  const date = value instanceof Date ? value : parseSubmissionDate(value);
  if (!date) return typeof value === 'string' ? value : '';

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, offset: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function getCalendarDays(month: Date) {
  const firstDay = startOfMonth(month);
  const startOffset = firstDay.getUTCDay();
  const calendarStart = new Date(firstDay);
  calendarStart.setUTCDate(firstDay.getUTCDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setUTCDate(calendarStart.getUTCDate() + index);

    return {
      date,
      key: date.toISOString(),
      inMonth: date.getUTCMonth() === month.getUTCMonth(),
    };
  });
}

function isSameUtcDay(first: Date, second: Date) {
  return (
    first.getUTCFullYear() === second.getUTCFullYear() &&
    first.getUTCMonth() === second.getUTCMonth() &&
    first.getUTCDate() === second.getUTCDate()
  );
}

export function ProviderField({
  label,
  options,
  provider,
  customUrl,
  error,
  onProvider,
  onUrl,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  provider: string;
  customUrl: string;
  error?: string;
  onProvider: (value: string) => void;
  onUrl: (value: string) => void;
}) {
  return (
    <div className="submission-provider-field">
      <Field label={label}>
        <select value={provider} onChange={(event) => onProvider(event.target.value)}>
          {options.map((option) => (
            <option key={option.value || 'blank'} value={option.value}>
              {option.value === 'custom' ? 'Custom Link' : option.label}
            </option>
          ))}
        </select>
      </Field>
      {provider === 'custom' && (
        <Field label={`Custom ${label}`} error={error}>
          <input value={customUrl} onChange={(event) => onUrl(event.target.value)} placeholder="" />
        </Field>
      )}
    </div>
  );
}

export function ContractRow({
  index,
  contract,
  errorChain,
  errorAddress,
  addressRequired,
  chainRequired,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  contract: CoinSubmissionValues['contracts'][number];
  errorChain?: string;
  errorAddress?: string;
  addressRequired: boolean;
  chainRequired: boolean;
  onChange: (index: number, field: 'chain' | 'address', nextValue: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="submission-contract-row">
      <ChainPicker
        value={contract.chain}
        error={errorChain}
        label="Chain"
        required={chainRequired}
        onChange={(nextValue) => onChange(index, 'chain', nextValue)}
      />
      <Field
        required={addressRequired}
        label={index === 0 ? 'Contract Address' : `Contract Address ${index + 1}`}
        error={errorAddress}
      >
        <input
          value={contract.address}
          onChange={(event) => onChange(index, 'address', event.target.value)}
          placeholder={index === 0 ? '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' : ''}
        />
      </Field>
      {canRemove ? (
        <button
          className="submission-contract-remove"
          type="button"
          aria-label="Remove contract address"
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function ChainPicker({
  value,
  error,
  label,
  required,
  onChange,
}: {
  value: SubmissionNetwork | '';
  error?: string;
  label: string;
  required: boolean;
  onChange: (nextValue: SubmissionNetwork | '') => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const active = NETWORKS[value || 'ethereum'];

  return (
    <div className="submission-chain-field">
      <span>
        {label} {required && <RequiredMark />}
      </span>
      <div className="submission-chain-picker" ref={ref}>
        <button
          type="button"
          className={`submission-chain-button ${open ? 'open' : ''}`}
          onClick={() => setOpen((current) => !current)}
        >
          {active?.iconUrl ? (
            <img src={active.iconUrl} alt="" />
          ) : (
            <CircleHelp aria-hidden="true" />
          )}
          <strong>{active.shortName}</strong>
          <ChevronDown aria-hidden="true" />
        </button>
        {open && (
          <div className="submission-chain-menu" role="listbox" aria-label="Chain menu">
            {submissionNetworks.map((network) => {
              const config = NETWORKS[network];
              const selected = network === (value || 'ethereum');
              return (
                <button
                  key={network}
                  type="button"
                  className={selected ? 'active' : ''}
                  onClick={() => {
                    onChange(network);
                    setOpen(false);
                  }}
                >
                  {config.iconUrl ? (
                    <img src={config.iconUrl} alt="" />
                  ) : (
                    <CircleHelp aria-hidden="true" />
                  )}
                  <span>{config.shortName}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {error && <small className="submission-inline-error">{error}</small>}
    </div>
  );
}

export type TurnstileSlotHandle = {
  verify: () => Promise<string>;
};

export const TurnstileSlot = forwardRef<
  TurnstileSlotHandle,
  {
    token: string;
    onToken: (nextValue: string) => void;
  }
>(({ token, onToken }, handleRef) => {
  const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY;
  const ref = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | number | null>(null);
  const pendingRef = useRef<((token: string) => void) | null>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let canceled = false;
    const scriptId = 'cf-turnstile-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const render = () => {
      const turnstile = (
        window as Window & {
          turnstile?: {
            render: (
              element: HTMLElement,
              options: {
                sitekey: string;
                size?: 'normal' | 'compact' | 'flexible';
                execution?: 'render' | 'execute';
                callback: (token: string) => void;
                'error-callback': () => void;
                'expired-callback': () => void;
              },
            ) => string | number;
            execute: (widgetId: string) => void;
          };
        }
      ).turnstile;
      if (canceled || widgetIdRef.current !== null) return true;
      if (!turnstile || !ref.current) return false;
      widgetIdRef.current = turnstile.render(ref.current, {
        sitekey: siteKey,
        size: 'normal',
        execution: 'execute',
        callback: (nextToken: string) => {
          onTokenRef.current(nextToken);
          pendingRef.current?.(nextToken);
          pendingRef.current = null;
        },
        'error-callback': () => {
          onTokenRef.current('');
          pendingRef.current?.('');
          pendingRef.current = null;
        },
        'expired-callback': () => onTokenRef.current(''),
      });
      return true;
    };

    let attempts = 0;
    const renderWhenReady = () => {
      if (render()) return;
      attempts += 1;
      if (attempts < 60) window.setTimeout(renderWhenReady, 250);
    };

    const timer = window.setTimeout(renderWhenReady, 0);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [siteKey]);

  useImperativeHandle(
    handleRef,
    () => ({
      verify: () =>
        new Promise((resolve) => {
          if (!siteKey) {
            resolve('');
            return;
          }
          if (token) {
            resolve(token);
            return;
          }

          const execute = (attempt = 0) => {
            const turnstile = (
              window as Window & {
                turnstile?: {
                  execute: (widgetId: string | number) => void;
                };
              }
            ).turnstile;

            if (!turnstile || widgetIdRef.current === null) {
              if (attempt < 20) {
                window.setTimeout(() => execute(attempt + 1), 150);
                return;
              }
              resolve('');
              return;
            }

            pendingRef.current = resolve;
            turnstile.execute(widgetIdRef.current);
          };

          execute();
          window.setTimeout(() => {
            if (!pendingRef.current) return;
            pendingRef.current = null;
            resolve('');
          }, 30_000);
        }),
    }),
    [siteKey, token],
  );

  if (!siteKey) {
    return null;
  }

  return (
    <div className="turnstile-shell">
      <div ref={ref} />
    </div>
  );
});

TurnstileSlot.displayName = 'TurnstileSlot';

export function ReviewCard({ section }: { section: ReviewSection }) {
  return (
    <article className="submission-review-card">
      <h2>{section.title}</h2>
      {section.logo && (
        <img className="submission-review-logo" src={section.logo} alt="Submitted project logo" />
      )}
      {section.items.map((item) => (
        <p key={item.label}>
          <span>{item.label}</span>
          <span className="submission-review-value">
            {item.chainIconUrl && (
              <img className="submission-review-chain-icon" src={item.chainIconUrl} alt="" />
            )}
            <span>{item.value || '—'}</span>
          </span>
        </p>
      ))}
    </article>
  );
}
