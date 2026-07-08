'use client';

import type { ReactNode } from 'react';
import type { WorklistStats } from '@/lib/api';

interface WorklistToolbarProps {
  stats: WorklistStats | null;
  /** Right-aligned actions rendered on the same row as the title (M38B). */
  actions?: ReactNode;
}

interface ChipDef {
  label: string;
  value: number | null;
  accent: string;
}

function chipValue(value: number | null): string {
  return value === null ? '—' : value.toLocaleString();
}

/**
 * Worklist header: a single compact row (title + actions) above full-width
 * summary chips (M38B). The table below is the primary workspace, so the
 * header spends as little vertical space as possible.
 */
export default function WorklistToolbar({ stats, actions }: WorklistToolbarProps) {
  const chips: ChipDef[] = [
    { label: 'Total', value: stats?.total ?? null, accent: 'var(--tp)' },
    { label: 'Pending', value: stats?.pending ?? null, accent: 'var(--warn)' },
    { label: 'Overdue', value: stats?.overdue ?? null, accent: 'var(--er)' },
    { label: 'Due Today', value: stats?.dueToday ?? null, accent: 'var(--info)' },
    { label: 'Completed', value: stats?.completed ?? null, accent: 'var(--p)' },
    { label: 'Escalations', value: stats?.escalations ?? null, accent: '#7c3aed' },
  ];

  return (
    <div className="wl-toolbar">
      <div className="wl-toolbar-row">
        <h1 className="page-title">Worklist</h1>
        {actions}
      </div>

      <div className="wl-chips">
        {chips.map((chip) => (
          <div key={chip.label} className="wl-chip">
            <span className="wl-chip-value" style={{ color: chip.accent }}>
              {chipValue(chip.value)}
            </span>
            <span className="wl-chip-label">{chip.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
