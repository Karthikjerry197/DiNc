'use client';

import { useMemo } from 'react';
import type { Activity } from '@/lib/api';

interface Props {
  /** The selected enrollment's workflow activities (already loaded by the page). */
  activities: Activity[];
  loading: boolean;
  /** Whether an enrollment is currently selected (drives the empty message). */
  hasEnrollment: boolean;
}

interface CareJourneySnapshot {
  total: number;
  completed: number;
  percent: number;
  /** First not-yet-completed workflow step, in workflow order. */
  currentStage: string | null;
  /** The step after the current one. */
  nextStage: string | null;
}

/**
 * Derives journey progress from the enrollment's existing workflow activities —
 * nothing is stored: percent = completed steps / total steps. Activities arrive
 * from the backend already in workflow order (due date ascending, nulls last),
 * so the first non-completed step IS the current stage and the one after it is
 * the next expected stage. Recomputed on every activities reload, which is how
 * the widget advances automatically with the workflow.
 */
function deriveJourney(activities: Activity[]): CareJourneySnapshot {
  const total = activities.length;
  const remaining = activities.filter((a) => a.status.toUpperCase() !== 'COMPLETED');
  const completed = total - remaining.length;
  return {
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    currentStage: remaining[0]?.name?.trim() || null,
    nextStage: remaining[1]?.name?.trim() || null,
  };
}

/**
 * Care Journey Progress (M37A) — the patient's progression through their
 * programme workflow, shown in the patient header for every authenticated
 * role. Not a generic completion metric: the bar, current stage and next
 * stage all come from the workflow activities themselves.
 */
export default function CareJourneyProgress({ activities, loading, hasEnrollment }: Props) {
  const journey = useMemo(() => deriveJourney(activities), [activities]);

  return (
    <div className="cz-section">
      <span className="cz-section-label">Care Journey Progress</span>
      {loading ? (
        <div className="cz-inline-empty">Loading journey…</div>
      ) : !hasEnrollment ? (
        <div className="cz-inline-empty">No active enrollment — no care journey to track.</div>
      ) : journey.total === 0 ? (
        <div className="cz-inline-empty">No workflow activities for this enrollment yet.</div>
      ) : (
        <div className="cjp">
          <div className="cjp-bar-row">
            <div
              className="cjp-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={journey.percent}
              aria-label="Care journey progress"
            >
              <div className="cjp-fill" style={{ width: `${journey.percent}%` }} />
            </div>
            <span className="cjp-percent">{journey.percent}%</span>
          </div>
          <div className="cjp-meta">
            {journey.completed} of {journey.total} workflow steps completed
          </div>
          <div className="cjp-stages">
            <div className="cjp-stage">
              <span className="cjp-stage-label">Current Stage</span>
              <span className="cjp-stage-value">
                {journey.currentStage ?? 'Journey complete'}
              </span>
            </div>
            <div className="cjp-stage">
              <span className="cjp-stage-label">Next Stage</span>
              <span className="cjp-stage-value">
                {journey.currentStage === null
                  ? '—'
                  : journey.nextStage ?? 'Programme completion'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
