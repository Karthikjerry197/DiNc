'use client';

import type { CarePlanProgress, ProgressType } from '@/lib/api';

const TYPE_LABELS: Record<ProgressType, string> = {
  ASSESSMENT:  'Assessment',
  UPDATE:      'Update',
  REVIEW:      'Review',
  ESCALATION:  'Escalation',
  ACHIEVEMENT: 'Achievement',
};

interface Props {
  entries: CarePlanProgress[];
}

export default function ProgressTimeline({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="cp-progress-empty">
        No progress entries recorded yet.
      </div>
    );
  }

  return (
    <div className="cp-progress-timeline">
      {entries.map((entry) => {
        const dateStr = new Date(entry.recordedAt).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
        });
        const timeStr = new Date(entry.recordedAt).toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit',
        });

        return (
          <div key={entry.id} className={`cp-progress-entry cp-progress-entry--${entry.progressType.toLowerCase()}`}>
            <div className="cp-progress-spine">
              <span className={`cp-progress-dot cp-progress-dot--${entry.progressType.toLowerCase()}`} />
              <span className="cp-progress-line" />
            </div>

            <div className="cp-progress-content">
              <div className="cp-progress-head">
                <span className={`cp-progress-type-badge cp-progress-type--${entry.progressType.toLowerCase()}`}>
                  {TYPE_LABELS[entry.progressType]}
                </span>
                {entry.goalTitle && (
                  <span className="cp-progress-goal-ref">
                    {entry.problemTitle && <span className="cp-progress-problem-ref">{entry.problemTitle} › </span>}
                    {entry.goalTitle}
                  </span>
                )}
              </div>

              <p className="cp-progress-note">{entry.progressNote}</p>

              <div className="cp-progress-foot">
                <span className="cp-progress-by">{entry.recordedBy}</span>
                <span className="cp-progress-at">{dateStr} · {timeStr}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
