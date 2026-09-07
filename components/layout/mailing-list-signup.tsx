'use client';

import { showRateLimitToast } from '@/lib/api/rate-limit-toast';
import { Check, Loader2, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';

type SubscribeState = 'idle' | 'loading' | 'success' | 'error';

export function MailingListSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<SubscribeState>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'loading') return;

    setStatus('loading');
    setMessage('');

    const response = await fetch('/api/mailing-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'homepage-bottom' }),
    }).catch(() => null);

    const body = (await response?.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
    } | null;

    if (!response?.ok || !body?.success) {
      if (showRateLimitToast(body)) {
        setStatus('idle');
        return;
      }
      setStatus('error');
      setMessage(body?.message || 'Use a valid email address.');
      return;
    }

    setStatus('success');
    setMessage('Thank you for subscribing!');
    setEmail('');
  }

  return (
    <section className="container mailing-list-signup" aria-labelledby="mailing-list-title">
      <div className="mailing-list-copy">
        <span>
          <Mail aria-hidden="true" />
          Mailing list
        </span>
        <h2 id="mailing-list-title">Get early project drops in your inbox.</h2>
        <p>
          Subscribe for launch updates, presale alerts, promoted campaigns, and EndorseCoin
          announcements.
        </p>
      </div>
      <form className="mailing-list-form" onSubmit={submit}>
        <label>
          <span>Email address</span>
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (status !== 'loading') {
                setStatus('idle');
                setMessage('');
              }
            }}
            placeholder="someone@example.com"
            autoComplete="email"
            required
          />
        </label>
        <button
          type="submit"
          className={status === 'loading' ? 'is-loading' : undefined}
          disabled={status === 'loading'}
          aria-busy={status === 'loading'}
        >
          {status === 'loading' ? (
            <Loader2 aria-hidden="true" />
          ) : status === 'success' ? (
            <Check aria-hidden="true" />
          ) : (
            <Mail aria-hidden="true" />
          )}
          <span>{status === 'loading' ? 'Subscribing...' : 'Subscribe'}</span>
        </button>
        {message && (
          <small className={`mailing-list-feedback ${status}`} role="status">
            {message}
          </small>
        )}
      </form>
    </section>
  );
}
