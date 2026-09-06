'use client';

import { Home, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export type SystemStatePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  primaryLabel?: string;
  secondaryLabel?: string;
  onSecondaryClick?: () => void;
};

export function SystemStatePage({
  eyebrow,
  title,
  description,
  icon,
  primaryLabel = 'Back to home',
  secondaryLabel,
  onSecondaryClick,
}: SystemStatePageProps) {
  return (
    <main className="market-page">
      <section className="container-fallback system-state-shell">
        <div className="system-state-card">
          <div className="system-state-icon">{icon}</div>
          <p className="eyebrow">
            <span>●</span> {eyebrow}
          </p>
          <h1>{title}</h1>
          <p>{description}</p>
          <div className="system-state-actions">
            <Link className="system-state-primary" href="/">
              <Home aria-hidden="true" />
              {primaryLabel}
            </Link>
            {secondaryLabel && onSecondaryClick && (
              <button className="system-state-secondary" type="button" onClick={onSecondaryClick}>
                <RotateCcw aria-hidden="true" />
                {secondaryLabel}
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
