'use client';

import { Check, X } from 'lucide-react';
import { showRateLimitToast } from '@/lib/api/rate-limit-toast';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

export function ChangeRequestModal({
  coinId,
  coinName,
  defaultType = 'change',
  open,
  onClose,
}: {
  coinId: number;
  coinName: string;
  defaultType?: 'change' | 'report';
  open: boolean;
  onClose: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const defaultChangeType = defaultType === 'report' ? 'Report duplicate or incorrect listing' : '';

  const close = useCallback(() => {
    setSubmitted(false);
    setFeedback('');
    setSaving(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [close, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setFeedback('');
    setSaving(true);

    const response = await fetch(`/api/coins/${coinId}/change-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changeType: formData.get('changeType'),
        requestedChanges: formData.get('requestedChanges'),
        evidenceUrl: formData.get('evidenceUrl'),
        email: formData.get('email'),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      if (!showRateLimitToast(body, 'request')) {
        setFeedback(body.message || 'Could not submit the request. Please try again.');
      }
      return;
    }

    setSubmitted(true);
  }

  if (!open) return null;

  return (
    <div className="change-modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        className="change-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="change-modal-close" onClick={close} aria-label="Close request form">
          <X aria-hidden="true" />
        </button>
        {submitted ? (
          <div className="change-request-success">
            <span>
              <Check aria-hidden="true" />
            </span>
            <small>REQUEST RECEIVED</small>
            <h2>Thanks for helping us improve the listing.</h2>
            <p>We&apos;ll review the requested changes before updating {coinName}.</p>
            <button onClick={close}>Done</button>
          </div>
        ) : (
          <>
            <div className="change-modal-heading">
              <small>LISTING CORRECTION</small>
              <h2 id="change-modal-title">Request a change</h2>
              <p>
                Tell us what should be updated on <b>{coinName}</b>. All changes are reviewed before
                publishing.
              </p>
            </div>
            <form className="change-request-form" key={defaultChangeType} onSubmit={submit}>
              <label>
                <span>What needs changing?</span>
                <select name="changeType" required defaultValue={defaultChangeType}>
                  <option value="" disabled>
                    Select a change type
                  </option>
                  <option>Coin information</option>
                  <option>Website or social link</option>
                  <option>Logo or branding</option>
                  <option>Chain or contract address</option>
                  <option>Audit or KYC information</option>
                  <option>Report duplicate or incorrect listing</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                <span>Requested changes</span>
                <textarea
                  name="requestedChanges"
                  required
                  minLength={10}
                  placeholder="Describe what is incorrect and what it should say instead."
                />
              </label>
              <label>
                <span>
                  Supporting link <i>Optional</i>
                </span>
                <input name="evidenceUrl" type="url" placeholder="https://" />
              </label>
              <label>
                <span>Contact email</span>
                <input name="email" type="email" required placeholder="someone@example.com" />
              </label>
              <p className="change-form-note">
                Submitting a request does not guarantee that the listing will be changed.
              </p>
              {feedback && (
                <p className="change-form-feedback" role="alert">
                  {feedback}
                </p>
              )}
              <div className="change-form-actions">
                <button type="button" onClick={close} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? 'Submitting...' : 'Submit request'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
