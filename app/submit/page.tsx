import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { CoinSubmissionForm } from '@/features/submissions/components/coin-submission-form';
import { getCurrentSession } from '@/lib/auth/session';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import '../market.css';
import './submit.css';

export const metadata: Metadata = {
  title: 'Submit a Crypto Project',
  description:
    'Submit a crypto project, token, or presale to EndorseCoin for review and future community voting.',
  alternates: {
    canonical: '/submit',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SubmitCoinPage() {
  const session = await getCurrentSession();

  if (!session) redirect('/');

  return (
    <main className="market-page submit-page">
      <SiteHeader active="none" initialSession={session} />
      <div className="container submission-shell">
        <CoinSubmissionForm userEmail={session.user.email || ''} />
      </div>
      <SiteFooter />
    </main>
  );
}
