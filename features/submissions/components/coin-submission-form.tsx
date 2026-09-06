'use client';

import { LogoCropDialog } from '@/features/submissions/components/logo-crop-dialog';
import {
  CategoryField,
  ContractRow,
  DateInput,
  Field,
  IconTextField,
  LinkField,
  LogoField,
  PresaleToggle,
  ProviderField,
  RequiredMark,
  ReviewCard,
  SectionCard,
  TurnstileSlot,
  type TurnstileSlotHandle,
} from '@/features/submissions/components/submission-fields';
import {
  clearScopedErrors,
  setByPath,
  stepFromIssues,
  toFieldErrors,
  validateStep,
  type FieldErrors,
} from '@/features/submissions/lib/form-utils';
import { socialLinkFields } from '@/features/submissions/lib/link-options';
import { handleLogoFile, type LogoDraft } from '@/features/submissions/lib/logo-utils';
import { defaultProviderOption, providerOptions } from '@/features/submissions/lib/market-options';
import { buildReviewSections } from '@/features/submissions/lib/review-sections';
import {
  coinSubmissionPayloadSchema,
  submissionPaymentTokens,
  type CoinSubmissionPayload,
  type CoinSubmissionValues,
  type SubmissionCategory,
  type SubmissionNetwork,
} from '@/features/submissions/schemas/coin-submission';
import confetti from 'canvas-confetti';
import { Check, ChevronLeft, ChevronRight, Home, Loader2, PartyPopper, Plus } from 'lucide-react';
import { showRateLimitToast } from '@/lib/api/rate-limit-toast';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

const steps = ['Basics', 'Links', 'Market', 'Security', 'Contact', 'Review'] as const;

const emptyLogo = {
  name: '',
  mimeType: 'image/png' as const,
  width: 0,
  height: 0,
  dataUrl: '',
};

const defaultChain: SubmissionNetwork = 'ethereum';
const emptyContract = (chain: SubmissionNetwork | '' = defaultChain) => ({ chain, address: '' });
const defaultMarketLinks = (chain: SubmissionNetwork) => ({
  chart: { provider: defaultProviderOption('chart', chain), customUrl: '' },
  dex: { provider: defaultProviderOption('dex', chain), customUrl: '' },
});

const initialValues = (email: string): CoinSubmissionValues => ({
  logo: emptyLogo,
  name: '',
  symbol: '',
  description: '',
  categories: [],
  isPresale: false,
  website: '',
  telegram: '',
  x: '',
  discord: '',
  github: '',
  whitepaper: '',
  contracts: [emptyContract()],
  launchDate: '01/13/2009',
  ...defaultMarketLinks(defaultChain),
  presale: {
    website: '',
    startDate: '01/13/2009',
    startTime: '00:00',
    endDate: '01/13/2009',
    endTime: '00:00',
    paymentToken: 'USDT',
    softCap: '',
    hardCap: '',
  },
  kycUrl: '',
  auditUrl: '',
  email,
  telegramContact: '',
  agreedToTerms: false,
  turnstileToken: '',
});

export function CoinSubmissionForm({ userEmail }: { userEmail: string }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<CoinSubmissionValues>(() => initialValues(userEmail));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [logoDraft, setLogoDraft] = useState<LogoDraft | null>(null);
  const [logoError, setLogoError] = useState('');
  const turnstileRef = useRef<TurnstileSlotHandle>(null);

  const activeStep = steps[stepIndex];
  const selectedChain = values.contracts[0]?.chain || defaultChain;
  const chartOptions = useMemo(() => providerOptions('chart', selectedChain), [selectedChain]);
  const dexOptions = useMemo(() => providerOptions('dex', selectedChain), [selectedChain]);
  const reviewSections = useMemo(() => buildReviewSections(values), [values]);
  const logoFieldError =
    errors.logo ||
    errors['logo.name'] ||
    errors['logo.width'] ||
    errors['logo.height'] ||
    errors['logo.dataUrl'];

  useEffect(() => {
    if (!submitted) return;

    const colors = ['#cbff4a', '#ffc52f', '#37d9ff', '#ffffff', '#b36bff'];
    void confetti({
      particleCount: 90,
      spread: 72,
      startVelocity: 42,
      scalar: 0.86,
      origin: { y: 0.72 },
      colors,
    });

    window.setTimeout(() => {
      void confetti({
        particleCount: 45,
        angle: 60,
        spread: 58,
        startVelocity: 36,
        scalar: 0.72,
        origin: { x: 0, y: 0.78 },
        colors,
      });
      void confetti({
        particleCount: 45,
        angle: 120,
        spread: 58,
        startVelocity: 36,
        scalar: 0.72,
        origin: { x: 1, y: 0.78 },
        colors,
      });
    }, 180);
  }, [submitted]);

  function update<K extends keyof CoinSubmissionValues>(
    field: K,
    nextValue: CoinSubmissionValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: nextValue }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field as string];
      return next;
    });
  }

  function updateNested(path: string, nextValue: string) {
    setValues((current) => setByPath(current, path, nextValue));
    setErrors((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
  }

  function updateContract(index: number, field: 'chain' | 'address', nextValue: string) {
    setValues((current) => {
      const contracts = current.contracts.map((contract, contractIndex) =>
        contractIndex === index ? { ...contract, [field]: nextValue } : contract,
      );
      if (index === 0 && field === 'chain') {
        const chain = nextValue || defaultChain;
        return {
          ...current,
          contracts,
          ...(current.isPresale
            ? { chart: { provider: '', customUrl: '' }, dex: { provider: '', customUrl: '' } }
            : defaultMarketLinks(chain as SubmissionNetwork)),
        };
      }
      return { ...current, contracts };
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[`contracts.${index}.${field}`];
      return next;
    });
  }

  function addContractRow() {
    setValues((current) => ({
      ...current,
      contracts: [...current.contracts, emptyContract()],
    }));
  }

  function removeContractRow(index: number) {
    setValues((current) => {
      if (current.contracts.length === 1) return current;
      const contracts = current.contracts.filter((_, contractIndex) => contractIndex !== index);
      return { ...current, contracts };
    });
    setErrors((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`contracts.${index}.`)) delete next[key];
      });
      return next;
    });
  }

  function updateCategories(category: SubmissionCategory) {
    if (!values.categories.includes(category) && values.categories.length >= 3) {
      setErrors((current) => ({ ...current, categories: 'Choose up to 3 categories.' }));
      return;
    }
    setValues((current) => {
      const categories = current.categories.includes(category)
        ? current.categories.filter((item) => item !== category)
        : [...current.categories, category];
      return { ...current, categories };
    });
    setErrors((current) => {
      const next = { ...current };
      delete next.categories;
      return next;
    });
  }

  function updatePresaleStatus(nextValue: boolean) {
    setValues((current) => ({
      ...current,
      isPresale: nextValue,
      ...(nextValue
        ? { chart: { provider: '', customUrl: '' }, dex: { provider: '', customUrl: '' } }
        : defaultMarketLinks((current.contracts[0]?.chain || defaultChain) as SubmissionNetwork)),
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next.isPresale;
      delete next['chart.provider'];
      delete next['chart.customUrl'];
      delete next['dex.provider'];
      delete next['dex.customUrl'];
      return next;
    });
  }

  function goNext() {
    const validation = validateStep(stepIndex, values);
    if (!validation.success) {
      setErrors(validation.errors);
      return;
    }
    setErrors((current) => clearScopedErrors(current, validation.clearedPaths));
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function goBack() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  function jumpTo(index: number) {
    if (index <= stepIndex) {
      setStepIndex(index);
      return;
    }
    const validation = validateStep(stepIndex, values);
    if (!validation.success) {
      setErrors(validation.errors);
      return;
    }
    setErrors((current) => clearScopedErrors(current, validation.clearedPaths));
    setStepIndex(index);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    const turnstileToken = values.turnstileToken || (await turnstileRef.current?.verify()) || '';
    if (process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY && !turnstileToken) {
      setSubmitting(false);
      setErrors({
        turnstileToken: 'Please complete the verification before submitting.',
      });
      setStepIndex(5);
      return;
    }

    const finalValues = { ...values, turnstileToken };
    const result = coinSubmissionPayloadSchema.safeParse(finalValues);
    if (!result.success) {
      setSubmitting(false);
      setErrors(toFieldErrors(result.error));
      setStepIndex(stepFromIssues(result.error.issues));
      return;
    }

    const response = await fetch('/api/coin-submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildSubmissionRequest(result.data)),
    });
    const body = await response.json().catch(() => ({}));
    setSubmitting(false);

    if (!response.ok) {
      if (!showRateLimitToast(body, 'submit')) {
        setErrors({ form: body.message || 'Could not submit your project right now.' });
      }
      return;
    }

    setErrors({});
    setSubmitted(true);
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
        <h1>{values.name || 'Your project'} is ready for review</h1>
        <p>Your submission has been received. We&apos;ll contact you if anything else is needed.</p>
        <div className="submission-success-actions">
          <button
            className="submission-primary"
            type="button"
            onClick={() => {
              setSubmitted(false);
              setStepIndex(0);
              setValues(initialValues(userEmail));
              setErrors({});
              setLogoDraft(null);
            }}
          >
            <PartyPopper aria-hidden="true" />
            Submit another project
          </button>
          <Link className="submission-secondary" href="/">
            <Home aria-hidden="true" />
            Go back home
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="submission-flow">
      <div className="submission-card-head">
        <div>
          <p className="eyebrow">
            <span>●</span> Submissions
          </p>
          <h1>Submit your project</h1>
          <p>Add your project details for review.</p>
        </div>
        <div className="submission-status">
          <b>{activeStep}</b>
          <span>
            Step {stepIndex + 1} of {steps.length}
          </span>
        </div>
      </div>

      <form className="submission-form" onSubmit={submit}>
        <section className="submission-card">
          <div className="submission-steps" aria-label="Submission steps">
            {steps.map((step, index) => (
              <button
                key={step}
                className={index === stepIndex ? 'active' : index < stepIndex ? 'done' : ''}
                type="button"
                onClick={() => jumpTo(index)}
              >
                <span>{index + 1}</span>
                {step}
              </button>
            ))}
          </div>

          {errors.form && <div className="submission-alert">{errors.form}</div>}

          {stepIndex === 0 && (
            <section className="submission-basics">
              <div className="submission-grid submission-basics-grid">
                <LogoField
                  value={values.logo}
                  error={logoFieldError}
                  draftError={logoError}
                  onSelect={(file) => handleLogoFile(file, setLogoDraft, setLogoError)}
                  onOpenCrop={() => {
                    if (!values.logo.dataUrl) return;
                    setLogoDraft(values.logo as LogoDraft);
                  }}
                  onRemove={() => {
                    update('logo', emptyLogo);
                    setLogoDraft(null);
                    setLogoError('');
                  }}
                />

                <div className="submission-identity-fields">
                  <Field
                    required
                    label="Coin name"
                    hint={`${values.name.length}/40`}
                    error={errors.name}
                  >
                    <input
                      value={values.name}
                      maxLength={40}
                      onChange={(event) => update('name', event.target.value)}
                      placeholder="Enter coin name"
                    />
                  </Field>

                  <Field
                    required
                    label="Symbol"
                    hint={`${values.symbol.length}/8`}
                    error={errors.symbol}
                  >
                    <input
                      value={values.symbol}
                      maxLength={8}
                      onChange={(event) => update('symbol', event.target.value.replace(/^\$/, ''))}
                      placeholder="Enter coin symbol"
                    />
                  </Field>
                </div>

                <Field
                  label="Description"
                  hint={`${values.description.length}/320`}
                  error={errors.description}
                  required
                  wide
                >
                  <textarea
                    value={values.description}
                    maxLength={320}
                    onChange={(event) => update('description', event.target.value)}
                    placeholder="Tell us about your project."
                  />
                </Field>

                <CategoryField
                  selected={values.categories}
                  error={errors.categories}
                  onToggle={updateCategories}
                />

                <PresaleToggle
                  value={values.isPresale}
                  error={errors.isPresale}
                  onChange={updatePresaleStatus}
                />
              </div>
            </section>
          )}

          {stepIndex === 1 && (
            <div className="submission-section-stack">
              <SectionCard>
                <div className="submission-link-stack">
                  <LinkField
                    required
                    icon="akar-icons:link-chain"
                    label="Website Link"
                    value={values.website || ''}
                    error={errors.website}
                    placeholder="https://example.com"
                    onChange={(nextValue) => update('website', nextValue)}
                  />
                  {socialLinkFields.map((item) => (
                    <LinkField
                      key={item.key}
                      icon={item.icon}
                      label={item.label}
                      value={values[item.key] || ''}
                      error={errors[item.key]}
                      placeholder={item.placeholder}
                      onChange={(nextValue) => update(item.key, nextValue)}
                    />
                  ))}
                </div>
              </SectionCard>
            </div>
          )}

          {stepIndex === 2 && (
            <div className="submission-section-stack">
              <SectionCard>
                <div className="submission-contracts">
                  {values.contracts.map((contract, index) => (
                    <ContractRow
                      key={`${index}-${contract.chain}`}
                      index={index}
                      contract={contract}
                      errorChain={errors[`contracts.${index}.chain`]}
                      errorAddress={errors[`contracts.${index}.address`]}
                      addressRequired={!values.isPresale}
                      chainRequired
                      onChange={updateContract}
                      onRemove={() => removeContractRow(index)}
                      canRemove={values.contracts.length > 1 && index > 0}
                    />
                  ))}

                  <button
                    className="submission-inline-action"
                    type="button"
                    onClick={addContractRow}
                  >
                    <Plus aria-hidden="true" />
                    Add another contract address
                  </button>
                </div>

                {values.isPresale ? (
                  <div className="submission-market-fields">
                    <Field wide label="Presale Website Link" error={errors['presale.website']}>
                      <input
                        value={values.presale.website}
                        onChange={(event) => updateNested('presale.website', event.target.value)}
                        placeholder=""
                      />
                    </Field>
                    <div className="submission-date-time-row">
                      <Field
                        required
                        label="Presale start date"
                        error={errors['presale.startDate']}
                      >
                        <DateInput
                          value={values.presale.startDate || ''}
                          onChange={(value) => updateNested('presale.startDate', value)}
                        />
                      </Field>
                      <Field required label="Start time (UTC)" error={errors['presale.startTime']}>
                        <input
                          type="time"
                          step={60}
                          value={values.presale.startTime}
                          onChange={(event) =>
                            updateNested('presale.startTime', event.target.value)
                          }
                        />
                      </Field>
                    </div>
                    <div className="submission-date-time-row">
                      <Field required label="Presale end date" error={errors['presale.endDate']}>
                        <DateInput
                          value={values.presale.endDate || ''}
                          onChange={(value) => updateNested('presale.endDate', value)}
                        />
                      </Field>
                      <Field required label="End time (UTC)" error={errors['presale.endTime']}>
                        <input
                          type="time"
                          step={60}
                          value={values.presale.endTime}
                          onChange={(event) => updateNested('presale.endTime', event.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="submission-cap-row">
                      <Field required label="Coin" error={errors['presale.paymentToken']}>
                        <select
                          value={values.presale.paymentToken}
                          onChange={(event) =>
                            updateNested('presale.paymentToken', event.target.value)
                          }
                        >
                          <option value=""></option>
                          {submissionPaymentTokens.map((token) => (
                            <option key={token} value={token}>
                              {token}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Soft cap" error={errors['presale.softCap']}>
                        <input
                          value={values.presale.softCap}
                          onChange={(event) => updateNested('presale.softCap', event.target.value)}
                        />
                      </Field>
                      <Field label="Hard cap" error={errors['presale.hardCap']}>
                        <input
                          value={values.presale.hardCap}
                          onChange={(event) => updateNested('presale.hardCap', event.target.value)}
                        />
                      </Field>
                    </div>
                  </div>
                ) : (
                  <div className="submission-market-fields">
                    <div className="submission-launch-row single">
                      <Field required label="Launch date (UTC)" error={errors.launchDate}>
                        <DateInput
                          value={values.launchDate || ''}
                          onChange={(value) => update('launchDate', value)}
                        />
                      </Field>
                    </div>
                    <p className="submission-market-note">
                      This determines when your project appears in Launched recently.
                    </p>
                    <ProviderField
                      label="Chart Link"
                      options={chartOptions}
                      provider={values.chart.provider || ''}
                      customUrl={values.chart.customUrl || ''}
                      error={errors['chart.customUrl']}
                      onProvider={(value) => updateNested('chart.provider', value)}
                      onUrl={(value) => updateNested('chart.customUrl', value)}
                    />
                    <ProviderField
                      label="DEX Link"
                      options={dexOptions}
                      provider={values.dex.provider || ''}
                      customUrl={values.dex.customUrl || ''}
                      error={errors['dex.customUrl']}
                      onProvider={(value) => updateNested('dex.provider', value)}
                      onUrl={(value) => updateNested('dex.customUrl', value)}
                    />
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {stepIndex === 3 && (
            <div className="submission-section-stack">
              <SectionCard>
                <div className="submission-trust-callout">
                  <h2>Build Investor Confidence</h2>
                  <p>
                    Investors move faster when they can see proof behind the project. Add your KYC
                    or audit report if you have one so your coin feels easier to trust and stronger
                    when people compare listings.
                  </p>
                </div>
                <div className="submission-link-stack">
                  <LinkField
                    icon="lucide:shield-check"
                    label="KYC Link"
                    value={values.kycUrl || ''}
                    error={errors.kycUrl}
                    placeholder=""
                    onChange={(value) => update('kycUrl', value)}
                  />
                  <LinkField
                    icon="lucide:file-check-2"
                    label="Audit Report Link"
                    value={values.auditUrl || ''}
                    error={errors.auditUrl}
                    placeholder=""
                    onChange={(value) => update('auditUrl', value)}
                  />
                </div>
              </SectionCard>
            </div>
          )}

          {stepIndex === 4 && (
            <div className="submission-section-stack">
              <SectionCard>
                <div className="submission-link-stack">
                  <IconTextField
                    required
                    icon="lucide:mail"
                    label="Contact email"
                    value={values.email}
                    readOnly
                  />
                  <IconTextField
                    required
                    icon="lucide:send"
                    label="Contact Telegram"
                    value={values.telegramContact}
                    error={errors.telegramContact}
                    placeholder="Telegram username"
                    onChange={(value) => update('telegramContact', value)}
                  />
                </div>
              </SectionCard>
            </div>
          )}

          {stepIndex === 5 && (
            <div className="submission-review-stack">
              <div className="submission-review">
                {reviewSections.map((section) => (
                  <ReviewCard key={section.title} section={section} />
                ))}
              </div>

              <SectionCard>
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
          )}
        </section>

        <div className="submission-step-actions">
          <button
            className="submission-step-button submission-step-button--secondary"
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0 || submitting}
          >
            <ChevronLeft aria-hidden="true" />
            Back
          </button>
          {stepIndex < steps.length - 1 ? (
            <button
              className="submission-step-button submission-step-button--primary"
              type="button"
              onClick={goNext}
              disabled={submitting}
            >
              Next
              <ChevronRight aria-hidden="true" />
            </button>
          ) : (
            <button
              className="submission-step-button submission-step-button--primary"
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              Submit project
            </button>
          )}
        </div>
      </form>

      {logoDraft && (
        <LogoCropDialog
          draft={logoDraft}
          onCancel={() => setLogoDraft(null)}
          onApply={(nextLogo) => {
            update('logo', nextLogo);
            setLogoDraft(null);
          }}
        />
      )}
    </div>
  );
}

function buildSubmissionRequest(payload: CoinSubmissionPayload) {
  const contracts = payload.contracts.map((contract) => ({
    chain: contract.chain,
    address: contract.address,
  }));
  const requestType = payload.isPresale ? 'presale' : 'launched';

  return {
    basic: {
      logo: payload.logo,
      name: payload.name,
      symbol: payload.symbol,
      description: payload.description,
      categories: payload.categories,
      isPresale: payload.isPresale,
    },
    links: {
      website: payload.website,
      telegram: payload.telegram,
      x: payload.x,
      discord: payload.discord,
      github: payload.github,
      whitepaper: payload.whitepaper,
    },
    market:
      requestType === 'presale'
        ? {
            type: requestType,
            primaryChain: contracts[0]?.chain || 'ethereum',
            contracts,
            presale: payload.presale,
          }
        : {
            type: requestType,
            primaryChain: contracts[0]?.chain || 'ethereum',
            contracts,
            launchDate: payload.launchDate,
            chart: payload.chart,
            dex: payload.dex,
          },
    security: {
      kycUrl: payload.kycUrl,
      auditUrl: payload.auditUrl,
    },
    contact: {
      email: payload.email,
      telegram: payload.telegramContact,
    },
    agreedToTerms: payload.agreedToTerms,
    turnstileToken: payload.turnstileToken,
  };
}
