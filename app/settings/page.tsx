import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SettingsPanel } from '@/features/settings/components/settings-panel';
import { getCurrentSession } from '@/lib/auth/session';
import { createPrivatePageMetadata } from '@/lib/seo/metadata';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import '../market.css';

export const metadata: Metadata = createPrivatePageMetadata('Settings', '/settings');

export default async function SettingsPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/');

  return (
    <main className="market-page">
      <SiteHeader active="none" initialSession={session} />
      <SettingsPanel user={{ name: session.user.name, email: session.user.email }} />
      <SiteFooter />
    </main>
  );
}
