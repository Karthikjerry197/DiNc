'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { fetchActiveAlerts, markAlertRead, type AlertWithCitizen } from '@/lib/api';
import { getToken } from '@/lib/session';
import { SkeletonLines } from '@/components/shell/Skeleton';

/**
 * Action Centre (M32/M33.1): the alert feed is SEVERE-only server-side —
 * moderate patients surface through the Dashboard's Clinical Risk analytics
 * instead. Every card navigates straight to the citizen workspace (patient
 * details, timeline and current activity — consultation one click away).
 */
const RISK_CONFIG: Record<'MODERATE' | 'SEVERE', { label: string; icon: ReactNode; cls: string }> = {
  MODERATE: { label: 'Moderate Risk', icon: <CircleAlert size={18} />, cls: 'moderate' },
  SEVERE:   { label: 'Severe Risk',   icon: <TriangleAlert size={18} />, cls: 'severe'   },
};

/**
 * Lifecycle views: Severe = unresolved alerts (unread listed first, read
 * muted); Resolved = handled history.
 */
const VIEWS = [
  { key: 'ACTIVE' as const,   label: 'Severe · Active' },
  { key: 'RESOLVED' as const, label: 'Resolved' },
];

function AlertCard({ alert, onOpen }: { alert: AlertWithCitizen; onOpen: () => void }) {
  const cfg = RISK_CONFIG[alert.riskLevel];
  // Read alerts stay in the feed but render muted; only ACTIVE alerts carry
  // the distinction (resolved history is inherently "handled").
  const read = alert.status === 'ACTIVE' && alert.isRead;
  return (
    <button
      type="button"
      className={`notif-alert-card notif-alert-card--${cfg.cls} notif-alert-card--link${read ? ' notif-alert-card--read' : ''}`}
      onClick={onOpen}
      title="Open the citizen workspace"
    >
      <div className="notif-alert-icon" aria-hidden="true">{cfg.icon}</div>
      <div className="notif-alert-body">
        <div className="notif-alert-citizen">
          {alert.citizenName ?? 'Unknown Patient'}
          {alert.uhid && <span className="notif-alert-uhid"> · {alert.uhid}</span>}
        </div>
        <div className="notif-alert-risk">
          <span className={`cdse-risk-badge cdse-risk-badge--${cfg.cls}`}>
            {cfg.label}
          </span>
          {alert.disease && <span className="notif-alert-disease">{alert.disease}</span>}
        </div>
        <div className="notif-alert-time">
          {new Date(alert.triggeredAt).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </div>
      </div>
      <div className={`notif-alert-status notif-alert-status--${alert.status.toLowerCase()}`}>
        {alert.status}
      </div>
    </button>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const [view, setView] = useState<'ACTIVE' | 'RESOLVED'>('ACTIVE');
  const [alerts, setAlerts] = useState<AlertWithCitizen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }

    let active = true;
    setLoading(true);
    setError('');
    fetchActiveAlerts(token, view)
      .then((data) => {
        if (active) { setAlerts(data); setLoading(false); }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load alerts.');
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [view]);

  const severe = alerts.filter((a) => a.riskLevel === 'SEVERE');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Action Centre</h1>
          <p className="page-subtitle">Severe clinical alerts requiring immediate action</p>
        </div>
        <div className="cz-tab-bar">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={`cz-tab-btn${view === v.key ? ' active' : ''}`}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <SkeletonLines lines={5} />}
      {error && <div className="dash-error">{error}</div>}

      {!loading && !error && severe.length === 0 && (
        <div className="notif-empty">
          <div className="notif-empty-icon" aria-hidden="true"><CircleCheck size={24} /></div>
          <div className="notif-empty-text">
            {view === 'ACTIVE' ? 'No severe clinical alerts' : 'No resolved alerts'}
          </div>
          <div className="notif-empty-sub">
            {view === 'ACTIVE'
              ? 'No patient currently requires immediate action. Moderate and low risk patients are summarised on the Dashboard.'
              : 'Resolved severe alerts will appear here.'}
          </div>
        </div>
      )}

      {severe.length > 0 && (
        <section className="notif-section">
          <h2 className="notif-section-title notif-section-title--severe">
            <TriangleAlert size={15} aria-hidden="true" /> Severe Risk ({severe.length})
          </h2>
          <div className="notif-list">
            {severe.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                onOpen={() => {
                  // Opening marks the alert read: optimistic local update plus
                  // fire-and-forget persist — navigation must not wait.
                  if (!a.isRead) {
                    setAlerts((prev) =>
                      prev.map((x) => (x.id === a.id ? { ...x, isRead: true } : x)),
                    );
                    const token = getToken();
                    if (token) markAlertRead(token, a.id).catch(() => undefined);
                  }
                  router.push(`/citizens?c=${a.citizenId}`);
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
