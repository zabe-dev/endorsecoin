import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { getApprovedProjectOptions } from '@/features/airdrops/server/approved-projects';
import { SubmissionTypeSwitcher } from '@/features/submissions/components/submission-type-switcher';
import { getCurrentSession } from '@/lib/auth/session';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import '../market.css';
import './submit.css';

export const metadata: Metadata = {
  title: 'Submit to EndorseCoin',
  description:
    'Submit a crypto project or airdrop to EndorseCoin for review and future community voting.',
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

  const approvedProjects = await getApprovedProjectOptions();

  return (
    <main className="market-page submit-page">
      <SiteHeader active="none" initialSession={session} />
      <div className="container submission-shell">
        <SubmissionTypeSwitcher
          userEmail={session.user.email || ''}
          approvedProjects={approvedProjects}
        />
      </div>
      <SiteFooter />
    </main>
  );
}
