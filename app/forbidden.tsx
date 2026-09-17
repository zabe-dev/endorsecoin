import { SystemStatePage } from '@/components/layout/system-state-page';

export default function Forbidden() {
  return <SystemStatePage code="403" message="You do not have permission to access this page." />;
}
