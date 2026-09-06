'use client';

import type { ReactNode } from 'react';

export function ActionGroup({ children }: { children: ReactNode }) {
  return <div className="admin-icon-actions">{children}</div>;
}


export function StatusPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'lime' | 'warning' | 'danger' | 'amber' | 'purple';
}) {
  return <span className={`admin-status-pill ${tone}`}>{children}</span>;
}
