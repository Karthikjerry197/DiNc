'use client';

import type { AdminDashboardSummary } from '@/lib/api';

interface Props {
  programs: AdminDashboardSummary['programs'];
}

/** Programme active-enrolment list. */
export default function ProgramsWidget({ programs }: Props) {
  if (!programs || programs.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">∅</div>
        <div className="empty-state-text">No active programs.</div>
      </div>
    );
  }

  return (
    <ul className="program-summary-list">
      {programs.map((p) => (
        <li key={p.name} className="program-summary-item">
          <span className="program-summary-name">{p.name}</span>
          <span className="program-summary-count">{p.activeEnrollments.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}
