'use client';

import { useEffect, useState } from 'react';
import type { Activity } from '@/lib/api';

interface ActivityWorkspaceProps {
  activities: Activity[];
  loading: boolean;
  error: string;
  /** Whether an enrollment is currently selected (drives the empty message). */
  hasEnrollment: boolean;
  onNewActivity: () => void;
  /** Opens the Teleconsultation window for an activity. */
  onStartCall?: (activityId: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function value(text: string | null): string {
  return text && text.trim() ? text : '—';
}

/**
 * Read-only Activity Workspace shown in the Citizen Workspace right panel.
 * Lists the selected enrollment's activities as a timeline; selecting one
 * reveals its details. No create/edit/complete actions exist this milestone.
 */
export default function ActivityWorkspace({
  activities,
  loading,
  error,
  hasEnrollment,
  onNewActivity,
  onStartCall,
}: ActivityWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep a sensible selection as the activity list changes.
  useEffect(() => {
    setSelectedId((current) => {
      if (current && activities.some((a) => a.id === current)) return current;
      return activities[0]?.id ?? null;
    });
  }, [activities]);

  return (
    <aside className="cz-timeline">
      <div className="cz-timeline-head">
        <div className="act-head-left">
          <h2 className="cz-panel-title">Activities</h2>
          <span className="cz-count">{hasEnrollment ? activities.length : 0}</span>
        </div>
        <button
          type="button"
          className="act-new-btn"
          title={hasEnrollment ? 'New activity' : 'Select an enrollment first'}
          onClick={onNewActivity}
          disabled={!hasEnrollment}
        >
          ＋ New Activity
        </button>
      </div>

      <div className="cz-timeline-list">
        {loading ? (
          <div className="dash-loading">Loading activities&hellip;</div>
        ) : error ? (
          <div className="dash-error">{error}</div>
        ) : !hasEnrollment ? (
          <EmptyState text="Select an enrollment to view its activities." />
        ) : activities.length === 0 ? (
          <EmptyState text="No activities recorded for this enrollment." />
        ) : (
          activities.map((activity) => {
            const open = activity.id === selectedId;
            return (
              <div key={activity.id} className={`cz-activity act-card${open ? ' selected' : ''}`}>
                <button
                  type="button"
                  className="act-card-head"
                  aria-expanded={open}
                  onClick={() => setSelectedId(open ? null : activity.id)}
                >
                  <span className="cz-activity-main">
                    <span className="cz-activity-title">{activity.name ?? 'Activity'}</span>
                    <span className="cz-activity-badges">
                      <span className={`pill pill-${activity.status.toLowerCase()}`}>
                        {activity.status}
                      </span>
                      <span className={`pill pill-${activity.priority.toLowerCase()}`}>
                        {activity.priority}
                      </span>
                    </span>
                    <span className="cz-activity-date">Due {formatDate(activity.dueDate)}</span>
                  </span>
                  <span className="act-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                </button>

                {open && (
                  <div className="act-detail">
                    <DetailRow label="Assigned User" value={value(activity.assignedUser)} />
                    <DetailRow label="Assigned Role" value={value(activity.assignedRole)} />
                    <DetailRow label="Linked Event" value={value(activity.event.name)} />
                    <DetailRow label="Created" value={formatDate(activity.createdDate)} />
                    <DetailRow label="Completed" value={formatDate(activity.completedDate)} />
                    <DetailRow label="Remarks" value={value(activity.remarks)} />
                    {onStartCall && (
                      <div className="act-detail-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => onStartCall(activity.id)}
                        >
                          📞 Start Consultation
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="act-row">
      <span className="act-label">{label}</span>
      <span className="act-value">{value}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">∅</div>
      <div className="empty-state-text">{text}</div>
    </div>
  );
}
