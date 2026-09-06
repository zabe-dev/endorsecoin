import { Suspense, type ComponentProps } from 'react';
import { Navbar } from '@/components/layout/navbar';
import { Topbar, TopbarFallback } from '@/components/layout/topbar';
import { getCurrentSession } from '@/lib/auth/session';

type SiteHeaderProps = {
  active?: 'discover' | 'airdrops' | 'none';
  initialSession?: ComponentProps<typeof Navbar>['initialSession'];
};

export async function SiteHeader({ active = 'discover', initialSession }: SiteHeaderProps) {
  const session = initialSession === undefined ? await getCurrentSession() : initialSession;

  return (
    <>
      <Suspense fallback={<TopbarFallback />}>
        <Topbar />
      </Suspense>
      <Navbar active={active} initialSession={session} />
    </>
  );
}
