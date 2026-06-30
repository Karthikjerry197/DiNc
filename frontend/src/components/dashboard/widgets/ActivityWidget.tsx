'use client';

import type { AdminDashboardSummary } from '@/lib/api';

interface Props {
  activity: AdminDashboardSummary['recentActivity'];
}

const ACTIVITY_ICON: Record<string, string> = {
  CITIZEN:      '👤',
  ENROLLMENT:   '📝',
  WORKLIST:     '☑',
  NOTIFICATION: '🔔',
};

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Recent system activity feed. */
export default function ActivityWidget({ activity }: Props) {
  if (!activity || activity.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">∅</div>
        <div className="empty-state-text">No recent activity.</div>
      </div>
    );
  }

  return (
    <ul className="activity-list">
      {activity.map((item, i) => (
        <li key={i} className="activity-item">
          <span className="activity-icon" aria-hidden="true">
            {ACTIVITY_ICON[item.kind] ?? '•'}
          </span>
          <div className="activity-body">
            <div className="activity-title">{item.title}</div>
            <div className="activity-sub">{item.subtitle}</div>
          </div>
          <span className="activity-time">{relativeTime(item.at)}</span>
        </li>
      ))}
    </ul>
  );
}
