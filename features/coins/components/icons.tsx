'use client';

import { Icon } from '@iconify/react';

export function BoltIcon() {
  return (
    <svg className="bolt-icon" aria-hidden="true" viewBox="0 0 448 512">
      <path
        fill="currentColor"
        d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288h111.5L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3S397.3 224 384 224H272.5l76.9-179.4z"
      />
    </svg>
  );
}

export function DiscoveryIcon({ type }: { type: 'new' | 'trend' | 'presale' | 'watch' }) {
  if (type === 'trend') {
    return (
      <Icon
        icon="fa6-solid:fire-flame-curved"
        className="discovery-icon top-icon"
        aria-hidden="true"
      />
    );
  }

  if (type === 'new') {
    return <Icon icon="entypo:new" className="discovery-icon new-icon" aria-hidden="true" />;
  }

  if (type === 'presale') {
    return <Icon icon="ix:coin-filled" className="discovery-icon trend-icon" aria-hidden="true" />;
  }

  return (
    <Icon
      icon="material-symbols:star-rounded"
      className="discovery-icon watch-icon"
      aria-hidden="true"
    />
  );
}
