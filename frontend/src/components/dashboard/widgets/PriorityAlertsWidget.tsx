'use client';

import { useRouter } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import type { AlertWithCitizen } from '@/lib/api';

interface Props {
  alerts: AlertWithCitizen[];
}

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Priority Alerts — top of the Dashboard inspector. Lists active clinical alerts
 * (SEVERE/MODERATE) from the existing `/api/alerts/active` endpoint (same source
 * as the TopBar bell and Notifications). Clicking opens the citizen workspace.
 */
export default function PriorityAlertsWidget({ alerts }: Props) {
  const router = useRouter();
  const active = alerts
    .filter((a) => a.status === 'ACTIVE')
    .sort((a, b) => {
      // SEVERE first, then most recent.
      if (a.riskLevel !== b.riskLevel) return a.riskLevel === 'SEVERE' ? -1 : 1;
      return new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime();
    });

  if (active.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true"><CircleCheck size={22} /></div>
        <div className="empty-state-text">No active clinical alerts.</div>
      </div>
    );
  }

  return (
    <ul className="dash-alert-list">
      {active.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            className="dash-alert-row"
            onClick={() => router.push(`/citizens?c=${a.citizenId}`)}
            title="Open citizen workspace"
          >
            <span className={`dash-alert-sev dash-alert-sev--${a.riskLevel.toLowerCase()}`}>
              {a.riskLevel}
            </span>
            <span className="dash-alert-body">
              {/* UHID is the Dashboard's only patient identity (never names). */}
              <span className="dash-alert-title">
                {a.uhid ?? 'Unknown citizen'}
                {a.disease ? ` · ${a.disease}` : ''}
              </span>
              <span className="dash-alert-meta">
                {relativeTime(a.triggeredAt)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
