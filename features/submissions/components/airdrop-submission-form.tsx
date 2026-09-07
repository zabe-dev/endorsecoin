'use client';

import type { ApprovedProjectOption } from '@/features/airdrops/types';
import {
  DateInput,
  Field,
  IconTextField,
  LinkField,
  RequiredMark,
  SectionCard,
  TurnstileSlot,
  type TurnstileSlotHandle,
} from '@/features/submissions/components/submission-fields';
import {
  airdropSocialLinkFields,
  airdropSubmissionPayloadSchema,
} from '@/features/submissions/schemas/airdrop-submission';
import { showRateLimitToast } from '@/lib/api/rate-limit-toast';
import { Check, Home, Loader2, PartyPopper, Search, Send } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';

type FieldErrors = Record<string, string>;

type AirdropSubmissionFormValues = {
  name: string;
  claimRewardsUrl: string;
  coinId: number;
  description: string;
  rewards: string;
  winnersCount: number;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  website: string;
  socialLinks: {
    telegram: string;
    x: string;
    reddit: string;
    discord: string;
    youtube: string;
    facebook: string;
  };
  agreedToTerms: boolean;
  turnstileToken: string;
};

function getTodayInputValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const emptySocialLinks = {
  telegram: '',
  x: '',
  reddit: '',
  discord: '',
  youtube: '',
  facebook: '',
};

const initialValues = (today: string): AirdropSubmissionFormValues => ({
  name: '',
  claimRewardsUrl: '',
  coinId: 0,
  description: '',
  rewards: '',
  winnersCount: 1,
  startDate: today,
  startTime: '00:00',
  endDate: today,
  endTime: '00:00',
  website: '',
  socialLinks: emptySocialLinks,
  agreedToTerms: false,
  turnstileToken: '',
});

export function AirdropSubmissionForm({
  userEmail,
  embedded = false,
  onStatusChange,
  onSubmittedChange,
}: {
  userEmail: string;
  embedded?: boolean;
  onStatusChange?: (status: { label: string; meta: string }) => void;
  onSubmittedChange?: (submitted: boolean) => void;
}) {
  const today = useMemo(() => getTodayInputValue(), []);
  const [values, setValues] = useState<AirdropSubmissionFormValues>(() => initialValues(today));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const [projectLookupState, setProjectLookupState] = useState<
    'idle' | 'searching' | 'found' | 'missing' | 'ambiguous'
  >('idle');
  const [selectedProject, setSelectedProject] = useState<ApprovedProjectOption | null>(null);
  const turnstileRef = useRef<TurnstileSlotHandle>(null);

  useEffect(() => {
    onStatusChange?.({ label: 'Airdrop', meta: 'Review queue' });
    onSubmittedChange?.(false);
  }, [onStatusChange, onSubmittedChange]);

  useEffect(() => {
    if (!submitted) return;

    let cancelled = false;
    const colors = ['#cbff4a', '#ffc52f', '#37d9ff', '#ffffff', '#b36bff'];
    void import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return;
      void confetti({
        particleCount: 70,
        spread: 68,
        startVelocity: 38,
        scalar: 0.78,
        origin: { y: 0.72 },
        colors,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [submitted]);

  function update<K extends keyof AirdropSubmissionFormValues>(
    field: K,
    nextValue: AirdropSubmissionFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: nextValue }));
    setErrors((current) => clearError(current, field as string));
  }

  function updateSocial(
    field: keyof AirdropSubmissionFormValues['socialLinks'],
    nextValue: string,
  ) {
    setValues((current) => ({
      ...current,
      socialLinks: { ...current.socialLinks, [field]: nextValue },
    }));
    setErrors((current) => clearError(current, `socialLinks.${field}`));
  }

  const projectMatchStatus = getProjectMatchStatus(projectLookupState, selectedProject);

  const resolveProjectQuery = useCallback(
    async (nextValue = projectQuery, signal?: AbortSignal) => {
      const normalizedValue = nextValue.trim();
      if (!normalizedValue) {
        setValues((current) => ({ ...current, coinId: 0 }));
        setSelectedProject(null);
        setErrors((current) => clearError(current, 'coinId'));
        setProjectLookupState('idle');
        return null;
      }

      setProjectLookupState('searching');

      try {
        const response = await fetch(
          `/api/approved-projects/lookup?q=${encodeURIComponent(normalizedValue)}`,
          { signal },
        );
        const body = (await response.json().catch(() => null)) as {
          success?: boolean;
          data?: ProjectLookupResult | null;
        } | null;

        if (signal?.aborted) return null;

        const result = response.ok && body?.success ? body.data : null;
        if (result?.status === 'found') {
          setSelectedProject(result.project);
          setValues((current) => ({ ...current, coinId: result.project.id }));
          setErrors((current) => clearError(current, 'coinId'));
          setProjectLookupState('found');
          setProjectQuery(formatProjectLabel(result.project));
          return result.project;
        }

        setSelectedProject(null);
        setValues((current) => ({ ...current, coinId: 0 }));
        setErrors((current) => clearError(current, 'coinId'));
        setProjectLookupState(result?.status === 'ambiguous' ? 'ambiguous' : 'missing');
        return null;
      } catch {
        if (signal?.aborted) return null;
        setSelectedProject(null);
        setValues((current) => ({ ...current, coinId: 0 }));
        setProjectLookupState('missing');
        return null;
      }
    },
    [projectQuery],
  );

  useEffect(() => {
    const query = projectQuery.trim();
    if (!query || projectLookupState !== 'searching') return;
    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      void resolveProjectQuery(query, controller.signal);
    }, 550);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [projectLookupState, projectQuery, resolveProjectQuery]);

  function updateProjectQuery(nextValue: string) {
    setProjectQuery(nextValue);
    setProjectLookupState(nextValue.trim() ? 'searching' : 'idle');
    setSelectedProject(null);
    setValues((current) => ({ ...current, coinId: 0 }));
    setErrors((current) => clearError(current, 'coinId'));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    const exactProject =
      selectedProject &&
      normalizeProjectLookup(projectQuery) ===
        normalizeProjectLookup(formatProjectLabel(selectedProject))
        ? selectedProject
        : await resolveProjectQuery(projectQuery);
    const selectedCoinId = exactProject?.id || values.coinId;
    if (!selectedCoinId) {
      setErrors({ coinId: 'Select an approved project.' });
      setSubmitting(false);
      return;
    }

    if (exactProject) {
      setProjectLookupState('found');
      setProjectQuery(formatProjectLabel(exactProject));
      setValues((current) => ({ ...current, coinId: exactProject.id }));
    }

    const turnstileToken = (await turnstileRef.current?.verify()) || '';
    if (process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY && !turnstileToken) {
      setSubmitting(false);
      setErrors({ turnstileToken: 'Please complete the verification before submitting.' });
      return;
    }

    const finalValues = { ...values, coinId: selectedCoinId, turnstileToken };
    const result = airdropSubmissionPayloadSchema.safeParse(finalValues);
    if (!result.success) {
      setSubmitting(false);
      setErrors(toFieldErrors(result.error));
      return;
    }

    const response = await fetch('/api/airdrop-submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(result.data),
    });
    const body = await response.json().catch(() => ({}));
    setSubmitting(false);

    if (!response.ok) {
      turnstileRef.current?.reset();
      setValues((current) => ({ ...current, turnstileToken: '' }));

      if (!showRateLimitToast(body)) {
        setErrors({ form: body.message || 'Could not submit your airdrop right now.' });
      }
      return;
    }

    setErrors({});
    setSubmitted(true);
    onSubmittedChange?.(true);
  }

  if (submitted) {
    return (
      <section className="submission-card submission-success">
        <span className="submission-success-icon">
          <Check aria-hidden="true" />
        </span>
        <p className="eyebrow">
          <span>●</span> Submission sent
        </p>
        <h1>{values.name || 'Your airdrop'} is ready for review</h1>
        <p>Your airdrop has been received. We&apos;ll contact you if anything else is needed.</p>
        <div className="submission-success-actions">
          <button
            className="submission-primary"
            type="button"
            onClick={() => {
              setSubmitted(false);
              onSubmittedChange?.(false);
              setValues(initialValues(today));
              setProjectQuery('');
              setProjectLookupState('idle');
              setSelectedProject(null);
              setErrors({});
            }}
          >
            <PartyPopper aria-hidden="true" />
            Submit another airdrop
          </button>
          <Link className="submission-secondary" href="/airdrops">
            <Home aria-hidden="true" />
            View airdrops
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="submission-flow">
      {!embedded && (
        <div className="submission-card-head">
          <div>
            <p className="eyebrow">
              <span>●</span> Airdrop submissions
            </p>
            <h1>Submit your airdrop</h1>
            <p>Reward your community with a verified airdrop.</p>
          </div>
          <div className="submission-status">
            <b>Airdrop</b>
            <span>Review queue</span>
          </div>
        </div>
      )}

      <form className="submission-form" onSubmit={submit}>
        <section className="submission-card">
          {errors.form && <div className="submission-alert">{errors.form}</div>}
          <div className="submission-section-stack">
            <SectionCard>
              <div className="submission-grid">
                <Field required label="Name" error={errors.name}>
                  <input
                    value={values.name}
                    maxLength={80}
                    onChange={(event) => update('name', event.target.value)}
                    placeholder="Early Signal Rewards"
                  />
                </Field>

                <Field required label="Project" error={errors.coinId}>
                  <span className="submission-project-search">
                    <Search aria-hidden="true" />
                    <input
                      value={projectQuery}
                      onBlur={() => void resolveProjectQuery()}
                      onChange={(event) => updateProjectQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void resolveProjectQuery();
                        }
                      }}
                      placeholder="Type exact project name or symbol"
                    />
                  </span>
                  {projectMatchStatus && (
                    <small
                      className={`submission-project-status submission-project-${projectLookupState}`}
                    >
                      {projectMatchStatus}
                    </small>
                  )}
                </Field>

                <Field
                  required
                  wide
                  label="Description"
                  hint={`${values.description.length}/500`}
                  error={errors.description}
                >
                  <textarea
                    value={values.description}
                    maxLength={500}
                    onChange={(event) => update('description', event.target.value)}
                    placeholder="Explain who can join, what users need to do, and any important conditions."
                  />
                </Field>

                <Field required label="Rewards" error={errors.rewards}>
                  <input
                    value={values.rewards}
                    maxLength={160}
                    onChange={(event) => update('rewards', event.target.value)}
                    placeholder="$2,500 token pool"
                  />
                </Field>

                <Field required label="Number of winners" error={errors.winnersCount}>
                  <input
                    min="1"
                    type="number"
                    value={values.winnersCount}
                    onChange={(event) => update('winnersCount', Number(event.target.value))}
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard>
              <div className="submission-link-stack">
                <LinkField
                  required
                  icon="akar-icons:link-chain"
                  label="Claim Rewards URL"
                  value={values.claimRewardsUrl}
                  error={errors.claimRewardsUrl}
                  placeholder="https://example.com"
                  onChange={(value) => update('claimRewardsUrl', value)}
                />
                <LinkField
                  required
                  icon="akar-icons:link-chain"
                  label="Website"
                  value={values.website}
                  error={errors.website}
                  placeholder="https://example.com"
                  onChange={(value) => update('website', value)}
                />
                <div className="submission-airdrop-social-grid">
                  {airdropSocialLinkFields.map((field) => (
                    <LinkField
                      key={field.key}
                      icon={field.icon}
                      label={field.label}
                      value={values.socialLinks[field.key] || ''}
                      error={errors[`socialLinks.${field.key}`]}
                      placeholder={field.placeholder}
                      onChange={(value) => updateSocial(field.key, value)}
                    />
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard>
              <div className="submission-airdrop-schedule-row">
                <Field required label="Start date" error={errors.startDate}>
                  <DateInput
                    value={values.startDate}
                    onChange={(value) => update('startDate', value)}
                  />
                </Field>
                <Field required label="Start time (UTC)" error={errors.startTime}>
                  <input
                    type="time"
                    step={60}
                    value={values.startTime}
                    onChange={(event) => update('startTime', event.target.value)}
                  />
                </Field>
                <Field required label="End date" error={errors.endDate}>
                  <DateInput
                    value={values.endDate}
                    onChange={(value) => update('endDate', value)}
                  />
                </Field>
                <Field required label="End time (UTC)" error={errors.endTime}>
                  <input
                    type="time"
                    step={60}
                    value={values.endTime}
                    onChange={(event) => update('endTime', event.target.value)}
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard>
              <IconTextField
                required
                icon="lucide:mail"
                label="Contact email"
                value={userEmail}
                readOnly
              />
              <label className="submission-terms">
                <input
                  className="submission-terms-checkbox"
                  type="checkbox"
                  checked={values.agreedToTerms}
                  onChange={(event) => update('agreedToTerms', event.target.checked)}
                />
                <span className="submission-terms-box" aria-hidden="true">
                  <Check aria-hidden="true" />
                </span>
                <span className="submission-terms-copy">
                  I agree to the{' '}
                  <Link
                    href="/terms"
                    className="submission-terms-link"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Terms and Conditions
                  </Link>{' '}
                  and acknowledge the{' '}
                  <Link
                    href="/privacy"
                    className="submission-terms-link"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Privacy Policy
                  </Link>{' '}
                  <RequiredMark />
                </span>
              </label>
              {errors.agreedToTerms && (
                <small className="submission-inline-error">{errors.agreedToTerms}</small>
              )}
              {errors.turnstileToken && (
                <small className="submission-inline-error">{errors.turnstileToken}</small>
              )}
              <TurnstileSlot
                ref={turnstileRef}
                token={values.turnstileToken || ''}
                onToken={(token) => update('turnstileToken', token)}
              />
            </SectionCard>
          </div>
        </section>

        <div className="submission-step-actions">
          <button
            className="submission-step-button submission-step-button--primary"
            type="submit"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="spin" aria-hidden="true" />
            ) : (
              <Send aria-hidden="true" />
            )}
            Submit airdrop
          </button>
        </div>
      </form>
    </div>
  );
}

function clearError(errors: FieldErrors, field: string) {
  const next = { ...errors };
  delete next[field];
  return next;
}

function toFieldErrors(error: z.ZodError) {
  return error.issues.reduce<FieldErrors>((fieldErrors, issue) => {
    const key = issue.path.join('.');
    fieldErrors[key || 'form'] = issue.message;
    return fieldErrors;
  }, {});
}

function getProjectMatchStatus(
  state: 'idle' | 'searching' | 'found' | 'missing' | 'ambiguous',
  selectedProject: ApprovedProjectOption | null,
) {
  if (state === 'idle') return '';
  if (state === 'searching') return 'Searching for project name....';
  if (state === 'found' && selectedProject)
    return `Selected ${formatProjectLabel(selectedProject)}.`;
  if (state === 'ambiguous')
    return 'Multiple approved projects match that name. Type the exact project name.';
  if (state === 'missing') return 'No approved project found with that exact name or symbol.';
  return '';
}

function normalizeProjectLookup(value: string) {
  return value.trim().replace(/^\$/, '').replace(/\s+/g, ' ').toLowerCase();
}

function formatProjectLabel(project: ApprovedProjectOption) {
  return `${project.name}${project.symbol ? ` (${project.symbol})` : ''}`;
}

type ProjectLookupResult =
  | { status: 'empty' }
  | { status: 'missing' }
  | { status: 'found'; project: ApprovedProjectOption }
  | { status: 'ambiguous'; projects: ApprovedProjectOption[] };
