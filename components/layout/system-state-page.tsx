import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export type SystemStatePageProps = {
  code: string;
  message: string;
};

export function SystemStatePage({ code, message }: SystemStatePageProps) {
  return (
    <main className="market-page">
      <section className="container-fallback system-state-shell">
        <div className="system-state-card">
          <p className="system-state-code">{code}</p>
          <p className="system-state-message">{message}</p>
          <div className="system-state-actions">
            <Link className="system-state-primary" href="/">
              <ArrowLeft aria-hidden="true" />
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
