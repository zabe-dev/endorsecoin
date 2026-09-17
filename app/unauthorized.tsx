import { SystemStatePage } from '@/components/layout/system-state-page';

export default function Unauthorized() {
  return <SystemStatePage code="401" message="You need to sign in to access this page." />;
}
