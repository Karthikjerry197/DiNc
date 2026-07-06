'use client';

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import type { AdminDashboardSummary, WorklistItem } from '@/lib/api';
import Panel from '@/components/workspace/Panel';
import PanelHeader from '@/components/workspace/PanelHeader';
import PanelContent from '@/components/workspace/PanelContent';
import WorklistWidget, {
  worklistOutcomeStats,
  type DashboardRiskFilter,
  type DashboardWorklistView,
} from './widgets/WorklistWidget';

const VIEW_OPTIONS: { value: DashboardWorklistView; label: string }[] = [
  { value: 'DEFAULT', label: "Today's Follow-ups" },
  { value: 'PENDING', label: 'Pending' },
  { value: 'DUE_TODAY', label: 'Due Today' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'ESCALATED', label: 'Escalated' },
];

const RISK_OPTIONS: { value: DashboardRiskFilter; label: string }[] = [
  { value: '', label: 'All Risk Levels' },
  { value: 'SEVERE', label: 'Severe' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'LOW', label: 'Low Risk' },
];

interface Props {
  worklist: AdminDashboardSummary['worklist'] | undefined;
  items: WorklistItem[];
  onFlash: (msg: string) => void;
  onConsult: (activityId: string) => void;
  onDuplicate: (citizenId: string, uhid: string, fullName: string) => void;
}

function fmt(v: number | null): string {
  return v == null ? '—' : v.toLocaleString();
}

/**
 * The Dashboard's primary content region. Purpose-built (not a Studio widget):
 * a Panel whose header carries the six worklist outcome metrics as compact chips,
 * with the follow-up table filling the scrollable content. Reuses WorklistWidget's
 * table/actions logic (with its internal stat strip hidden).
 */
export default function TodaysWorklistPanel({
  worklist,
  items,
  onFlash,
  onConsult,
  onDuplicate,
}: Props) {
  const outcomes = worklistOutcomeStats(worklist);
  const [view, setView] = useState<DashboardWorklistView>('DEFAULT');
  const [risk, setRisk] = useState<DashboardRiskFilter>('');

  return (
    <Panel aria-label="Today's Worklist">
      <PanelHeader
        title={
          <span className="dash-inline-icon-title">
            <ClipboardList size={16} aria-hidden="true" />
            Today&apos;s Worklist
          </span>
        }
        actions={
          <div className="dash-wl-chips">
            {outcomes.map((s) => (
              <span key={s.label} className="dash-wl-chip">
                <span className="dash-wl-chip-value" style={{ color: s.accent }}>
                  {fmt(s.value)}
                </span>
                <span className="dash-wl-chip-label">{s.label}</span>
              </span>
            ))}
          </div>
        }
      />
      <PanelContent padded={false} className="dash-wl-body">
        {/* Live view/risk filters (M33.1) — reuses the worklist select styling. */}
        <div className="dash-wl-filterbar">
          <select
            className="wl-select"
            value={view}
            aria-label="Filter worklist view"
            onChange={(e) => setView(e.target.value as DashboardWorklistView)}
          >
            {VIEW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            className="wl-select"
            value={risk}
            aria-label="Filter by clinical risk"
            onChange={(e) => setRisk(e.target.value as DashboardRiskFilter)}
          >
            {RISK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <WorklistWidget
          worklist={worklist}
          items={items}
          onFlash={onFlash}
          onConsult={onConsult}
          onDuplicate={onDuplicate}
          showStats={false}
          view={view}
          risk={risk}
        />
      </PanelContent>
    </Panel>
  );
}
