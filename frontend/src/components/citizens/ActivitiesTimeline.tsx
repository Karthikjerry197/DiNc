'use client';

import type { ActivityEntry, CitizenDetail } from '@/lib/api';

interface ActivitiesTimelineProps {
  detail: CitizenDetail | null;
  loading: boolean;
  onComingSoon: (label: string) => void;
}

/** Timeline filter chips — UI only this milestone. */
const FILTER_CHIPS = ['All', 'Pending', 'Completed', 'Overdue'];

/** Row action icons — UI only this milestone. */
const ROW_ACTIONS: { key: string; icon: string; label: string }[] = [
  { key: 'open', icon: '↗', label: 'Open' },
  { key: 'history', icon: '🕘', label: 'History' },
  { key: 'guidebook', icon: '📘', label: 'Guidebook' },
  { key: 'more', icon: '⋯', label: 'More' },
];

function formatDate(iso: string | null): string {
  if (!iso) return 'No due date';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ActivitiesTimeline({
  detail,
  loading,
  onComingSoon,
}: ActivitiesTimelineProps) {
  const activities: ActivityEntry[] = detail?.activities ?? [];

  return (
    <aside className="cz-timeline">
      <div className="cz-timeline-head">
        <h2 className="cz-panel-title">Activities</h2>
        <span className="cz-count">{detail ? activities.length : 0}</span>
      </div>

      <div className="cz-timeline-filters">
        {FILTER_CHIPS.map((chip, i) => (
          <button
            key={chip}
            type="button"
            className={`cz-filter-chip${i === 0 ? ' active' : ''}`}
            onClick={() => onComingSoon(`Filter: ${chip}`)}
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="cz-timeline-list">
        {loading ? (
          <div className="dash-loading">Loading activities&hellip;</div>
        ) : activities.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">∅</div>
            <div className="empty-state-text">No activities recorded for this citizen.</div>
          </div>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="cz-activity">
              <div className="cz-activity-main">
                <div className="cz-activity-title">{activity.activity ?? 'Activity'}</div>
                <div className="cz-activity-badges">
                  {activity.program && (
                    <span className="cz-program-badge">{activity.program}</span>
                  )}
                  <span className={`pill pill-${activity.status.toLowerCase()}`}>
                    {activity.status}
                  </span>
                  <span className={`pill pill-${activity.priority.toLowerCase()}`}>
                    {activity.priority}
                  </span>
                </div>
                <div className="cz-activity-date">{formatDate(activity.dueDate)}</div>
              </div>
              <div className="cz-activity-actions">
                {ROW_ACTIONS.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    className="wl-icon-btn"
                    title={action.label}
                    aria-label={action.label}
                    onClick={() => onComingSoon(action.label)}
                  >
                    {action.icon}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
