import { SystemStatePage } from '@/components/layout/system-state-page';
import { ShieldX } from 'lucide-react';

export default function Forbidden() {
  return (
    <SystemStatePage
      eyebrow="403"
      title="You can’t access this area."
      description="This page is limited to users with the right permissions. If you think this is wrong, check your account role and try again."
      icon={<ShieldX aria-hidden="true" />}
    />
  );
}
