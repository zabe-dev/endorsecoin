import { SystemStatePage } from '@/components/layout/system-state-page';
import { LockKeyhole } from 'lucide-react';

export default function Unauthorized() {
  return (
    <SystemStatePage
      eyebrow="401"
      title="Sign in to continue."
      description="This page needs an active EndorseCoin session before it can show private account details."
      icon={<LockKeyhole aria-hidden="true" />}
    />
  );
}
