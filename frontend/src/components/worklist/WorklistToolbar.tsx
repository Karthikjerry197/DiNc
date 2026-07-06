'use client';

import type { WorklistStats } from '@/lib/api';

interface WorklistToolbarProps {
  stats: WorklistStats | null;
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
 * Worklist header: page title and live summary chips. Bulk/reminder/export
 * actions were removed in M35A (Wave 1) — they were placeholders with no
 * behaviour; they return here only when their functionality ships.
 */
export default function WorklistToolbar({ stats }: WorklistToolbarProps) {
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
        <div>
          <h1 className="page-title">Worklist</h1>
          <p className="page-subtitle">Operational task queue · live records</p>
        </div>
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
