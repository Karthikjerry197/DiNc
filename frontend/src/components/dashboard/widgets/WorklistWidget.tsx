'use client';

import { useMemo } from 'react';
import type { AdminDashboardSummary, WorklistItem } from '@/lib/api';
import FollowupTable from './FollowupTable';

/** Dashboard worklist view filters (M33.1). DEFAULT = pending due today (legacy). */
export type DashboardWorklistView =
  | 'DEFAULT'
  | 'PENDING'
  | 'DUE_TODAY'
  | 'OVERDUE'
  | 'ESCALATED';

export type DashboardRiskFilter = '' | 'SEVERE' | 'MODERATE' | 'LOW';

interface Props {
  worklist: AdminDashboardSummary['worklist'] | undefined;
  items: WorklistItem[];
  onFlash: (msg: string) => void;
  onConsult: (activityId: string) => void;
  onDuplicate: (citizenId: string, uhid: string, fullName: string) => void;
  /**
   * Render the built-in outcome stat strip above the table. Default true (legacy
   * Studio widget). The M27 Dashboard sets this false and renders the outcomes in
   * the TodaysWorklistPanel header instead — see worklistOutcomeStats().
   */
  showStats?: boolean;
  /** Which slice of the worklist to show (M33.1 filters). */
  view?: DashboardWorklistView;
  /** Clinical risk filter; LOW matches items with no active alert. */
  risk?: DashboardRiskFilter;
}

export interface WorklistOutcomeStat {
  label: string;
  value: number | null;
  accent: string;
}

/** The six worklist outcome metrics, shared by the widget strip and the panel header. */
export function worklistOutcomeStats(
  worklist: AdminDashboardSummary['worklist'] | undefined,
): WorklistOutcomeStat[] {
  // Colour communicates importance, not decoration: outcomes are neutral by
  // default; only the two that demand attention (Overdue, Emergency) go red,
  // and only while their count is non-zero — a red "0" signals false urgency.
  const NEUTRAL = 'var(--tp)';
  const DANGER = 'var(--er)';
  const danger = (v: number | null | undefined) => ((v ?? 0) > 0 ? DANGER : NEUTRAL);
  return [
    { label: 'Completed Today', value: worklist?.completedToday      ?? null, accent: NEUTRAL },
    { label: 'Pending',         value: worklist?.pending             ?? null, accent: NEUTRAL },
    { label: 'Overdue',         value: worklist?.overdue             ?? null, accent: danger(worklist?.overdue) },
    { label: 'Referred',        value: worklist?.referred            ?? null, accent: NEUTRAL },
    { label: 'No Answer',       value: worklist?.noAnswer            ?? null, accent: NEUTRAL },
    { label: 'Emergency',       value: worklist?.emergencyReferrals  ?? null, accent: danger(worklist?.emergencyReferrals) },
  ];
}

function statValue(v: number | null): string {
  return v === null ? '—' : v.toLocaleString();
}

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Consultation stat strip + follow-up worklist table. */
export default function WorklistWidget({
  worklist,
  items,
  onFlash,
  onConsult,
  onDuplicate,
  showStats = true,
  view = 'DEFAULT',
  risk = '',
}: Props) {
  const followups = useMemo(() => {
    const cutoff = endOfToday();
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const dueTime = (i: WorklistItem) => (i.dueDate ? new Date(i.dueDate).getTime() : null);

    let slice: WorklistItem[];
    switch (view) {
      case 'PENDING':
        slice = items.filter((i) => i.status.toUpperCase() === 'PENDING');
        break;
      case 'DUE_TODAY':
        slice = items.filter((i) => {
          const t = dueTime(i);
          return t !== null && t >= startToday.getTime() && t <= cutoff;
        });
        break;
      case 'OVERDUE':
        slice = items.filter((i) => {
          const t = dueTime(i);
          return i.status.toUpperCase() === 'PENDING' && t !== null && t < startToday.getTime();
        });
        break;
      case 'ESCALATED':
        slice = items.filter((i) => i.isEscalation || i.status.toUpperCase() === 'EMERGENCY');
        break;
      default: {
        // Legacy default: pending items due today (or all pending when none).
        const pending = items.filter((i) => i.status.toUpperCase() === 'PENDING');
        const due = pending.filter((i) => {
          const t = dueTime(i);
          return t !== null && t <= cutoff;
        });
        slice = due.length > 0 ? due : pending;
      }
    }

    if (risk === 'LOW') {
      slice = slice.filter((i) => i.riskLevel !== 'SEVERE' && i.riskLevel !== 'MODERATE');
    } else if (risk) {
      slice = slice.filter((i) => i.riskLevel === risk);
    }
    return slice.slice(0, 12);
  }, [items, view, risk]);

  const stats = worklistOutcomeStats(worklist);

  return (
    <>
      {showStats && (
        <div className="consult-stat-row">
          {stats.map((s) => (
            <div key={s.label} className="consult-stat">
              <span className="consult-stat-value" style={{ color: s.accent }}>{statValue(s.value)}</span>
              <span className="consult-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <FollowupTable
        items={followups}
        onFlash={onFlash}
        onConsult={onConsult}
        onDuplicate={onDuplicate}
      />
    </>
  );
}
