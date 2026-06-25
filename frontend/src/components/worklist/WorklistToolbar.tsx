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
 * Worklist header: page title, live summary chips, and quick action buttons.
 * The action buttons are UI-only for this milestone (no behaviour wired up).
 */
export default function WorklistToolbar({ stats }: WorklistToolbarProps) {
  const chips: ChipDef[] = [
    { label: 'Total', value: stats?.total ?? null, accent: '#1f2937' },
    { label: 'Pending', value: stats?.pending ?? null, accent: '#d97706' },
    { label: 'Overdue', value: stats?.overdue ?? null, accent: '#dc2626' },
    { label: 'Due Today', value: stats?.dueToday ?? null, accent: '#0284c7' },
    { label: 'Completed', value: stats?.completed ?? null, accent: '#24a148' },
    { label: 'Escalations', value: stats?.escalations ?? null, accent: '#7c3aed' },
  ];

  return (
    <div className="wl-toolbar">
      <div className="wl-toolbar-row">
        <div>
          <h1 className="page-title">Worklist</h1>
          <p className="page-subtitle">Operational task queue · live records</p>
        </div>
        <div className="wl-actions">
          <button type="button" className="wl-btn" title="Bulk actions (coming soon)" disabled>
            ☰ Bulk
          </button>
          <button type="button" className="wl-btn" title="Send reminders (coming soon)" disabled>
            🔔 Reminders
          </button>
          <button type="button" className="wl-btn" title="Export (coming soon)" disabled>
            ⭳ Export
          </button>
          <button type="button" className="wl-btn wl-btn-primary" title="Quick worklist (coming soon)">
            ＋ Quick Worklist
          </button>
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
