'use client';

import { AuthModal } from '@/features/auth/components/lazy-auth-modal';
import { authClient } from '@/lib/auth/client';
import { Send } from 'lucide-react';
import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';

const subscribeToHydration = () => () => undefined;
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

export function SubmitProjectAction() {
  const [authOpen, setAuthOpen] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerSnapshot,
  );
  const { data: session } = authClient.useSession();

  if (hydrated && session?.user) {
    return (
      <Link className="advertise-secondary" href="/submit">
        <Send aria-hidden="true" />
        Submit your project first
      </Link>
    );
  }

  return (
    <>
      <button className="advertise-secondary" type="button" onClick={() => setAuthOpen(true)}>
        <Send aria-hidden="true" />
        Submit your project first
      </button>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
