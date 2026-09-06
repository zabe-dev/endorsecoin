'use client';

import { AirdropSubmissionForm } from '@/features/submissions/components/airdrop-submission-form';
import { CoinSubmissionForm } from '@/features/submissions/components/coin-submission-form';
import { Gift, Rocket } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

type SubmissionMode = 'project' | 'airdrop';

type SubmissionStatus = {
  label: string;
  meta: string;
};

const modeCopy = {
  project: {
    eyebrow: 'Submissions',
    title: 'Submit your project',
    description: 'Add your project details for review.',
  },
  airdrop: {
    eyebrow: 'Airdrop submissions',
    title: 'Submit your airdrop',
    description: 'Reward your community with a verified airdrop.',
  },
} satisfies Record<SubmissionMode, { eyebrow: string; title: string; description: string }>;

export function SubmissionTypeSwitcher({ userEmail }: { userEmail: string }) {
  const [mode, setMode] = useState<SubmissionMode>('project');
  const [status, setStatus] = useState<SubmissionStatus>({ label: 'Basics', meta: 'Step 1 of 6' });
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const copy = modeCopy[mode];
  const updateStatus = useCallback((nextStatus: SubmissionStatus) => setStatus(nextStatus), []);
  const modeKey = useMemo(() => `${mode}-${status.label}`, [mode, status.label]);

  function changeMode(nextMode: SubmissionMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setSubmissionComplete(false);
    setStatus(
      nextMode === 'project'
        ? { label: 'Basics', meta: 'Step 1 of 6' }
        : { label: 'Airdrop', meta: 'Review queue' },
    );
  }

  return (
    <div className="submission-composer">
      {!submissionComplete && (
        <div className="submission-composer-head">
          <p className="eyebrow">
            <span>●</span> {copy.eyebrow}
          </p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      )}

      {!submissionComplete && (
        <div className="submission-control-row">
          <section
            className={`submission-type-switcher is-${mode}`}
            aria-label="Choose submission type"
          >
            <button
              type="button"
              className={mode === 'project' ? 'active' : ''}
              onClick={() => changeMode('project')}
            >
              <span>
                <Rocket aria-hidden="true" />
              </span>
              <b>Project</b>
              <small>Coin, token, or presale</small>
            </button>
            <button
              type="button"
              className={mode === 'airdrop' ? 'active' : ''}
              onClick={() => changeMode('airdrop')}
            >
              <span>
                <Gift aria-hidden="true" />
              </span>
              <b>Airdrop</b>
              <small>Rewards campaign</small>
            </button>
          </section>

          <div className="submission-status submission-composer-status" key={modeKey}>
            <b>{status.label}</b>
            <span>{status.meta}</span>
          </div>
        </div>
      )}

      <div className="submission-mode-panel" key={mode}>
        {mode === 'project' ? (
          <CoinSubmissionForm
            userEmail={userEmail}
            embedded
            onStatusChange={updateStatus}
            onSubmittedChange={setSubmissionComplete}
          />
        ) : (
          <AirdropSubmissionForm
            userEmail={userEmail}
            embedded
            onStatusChange={updateStatus}
            onSubmittedChange={setSubmissionComplete}
          />
        )}
      </div>
    </div>
  );
}
