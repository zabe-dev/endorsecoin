import { SystemStatePage } from '@/components/layout/system-state-page';
import { Ghost } from 'lucide-react';

export default function NotFound() {
  return (
    <SystemStatePage
      eyebrow="404"
      title="This page wandered off."
      description="The page you’re looking for does not exist, moved, or was swallowed by the spooky side of the chain."
      icon={<Ghost aria-hidden="true" />}
    />
  );
}
