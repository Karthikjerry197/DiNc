'use client';

import type { MonitoringEntry } from '@/lib/api';

interface TeamMonitoringProps {
  monitoring: MonitoringEntry[];
}

function roleLabel(role: string): string {
  switch (role) {
    case 'ADMIN':
      return 'Administrator';
    case 'CLINICIAN':
      return 'Clinical Staff';
    case 'CARE_ASSISTANT':
      return 'Care Assistant';
    default:
      return role;
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Team Monitoring strip. Renders the active users from the database with their
 * pending task count. No monitoring logic is implemented this milestone — the
 * chips are display-only. Shows an empty state when there is nothing to monitor.
 */
export default function TeamMonitoring({ monitoring }: TeamMonitoringProps) {
  return (
    <div className="wl-monitoring">
      <span className="wl-monitoring-label">Team Monitoring</span>
      {monitoring.length > 0 ? (
        <div className="wl-monitoring-chips">
          {monitoring.map((entry) => (
            <div key={entry.username} className="wl-monitor-chip" title={roleLabel(entry.role)}>
              <span className="wl-monitor-avatar" aria-hidden="true">{initials(entry.fullName)}</span>
              <span className="wl-monitor-name">{entry.fullName}</span>
              <span className="wl-monitor-count">{entry.pending}</span>
            </div>
          ))}
        </div>
      ) : (
        <span className="wl-monitoring-empty">No team members to monitor.</span>
      )}
    </div>
  );
}
