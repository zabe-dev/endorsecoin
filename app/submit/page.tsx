import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SubmissionTypeSwitcher } from '@/features/submissions/components/submission-type-switcher';
import { getCurrentSession } from '@/lib/auth/session';
import { createPrivatePageMetadata } from '@/lib/seo/metadata';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import '../market.css';
import './submit.css';

export const metadata: Metadata = {
  ...createPrivatePageMetadata('Submit', '/submit'),
  description: 'Submit a project or airdrop to EndorseCoin for review.',
};

export default async function SubmitCoinPage() {
  const session = await getCurrentSession();

  if (!session) redirect('/');

  return (
    <main className="market-page submit-page">
      <SiteHeader active="none" initialSession={session} />
      <div className="container submission-shell">
        <SubmissionTypeSwitcher userEmail={session.user.email || ''} />
      </div>
      <SiteFooter />
    </main>
  );
}
