'use client';

import { useEffect, useState } from 'react';
import { fetchActiveAlerts, type AlertWithCitizen, type CdseRiskLevel } from '@/lib/api';
import { getToken } from '@/lib/session';

const RISK_CONFIG: Record<'MODERATE' | 'SEVERE', { label: string; icon: string; cls: string }> = {
  MODERATE: { label: 'Moderate Risk', icon: '◈', cls: 'moderate' },
  SEVERE:   { label: 'Severe Risk',   icon: '⚠', cls: 'severe'   },
};

function AlertCard({ alert }: { alert: AlertWithCitizen }) {
  const cfg = RISK_CONFIG[alert.riskLevel];
  return (
    <div className={`notif-alert-card notif-alert-card--${cfg.cls}`}>
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
    </div>
  );
}

export default function NotificationsPage() {
  const [alerts, setAlerts] = useState<AlertWithCitizen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }

    fetchActiveAlerts(token)
      .then((data) => { setAlerts(data); setLoading(false); })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load alerts.');
        setLoading(false);
      });
  }, []);

  const severe   = alerts.filter((a) => a.riskLevel === 'SEVERE');
  const moderate = alerts.filter((a) => a.riskLevel === 'MODERATE');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Active clinical alerts requiring attention</p>
        </div>
      </div>

      {loading && <div className="dash-loading">Loading alerts&hellip;</div>}
      {error && <div className="dash-error">{error}</div>}

      {!loading && alerts.length === 0 && (
        <div className="notif-empty">
          <div className="notif-empty-icon">✓</div>
          <div className="notif-empty-text">No active clinical alerts</div>
          <div className="notif-empty-sub">All patients are at low or no risk.</div>
        </div>
      )}

      {severe.length > 0 && (
        <section className="notif-section">
          <h2 className="notif-section-title notif-section-title--severe">
            <span aria-hidden="true">⚠</span> Severe Risk ({severe.length})
          </h2>
          <div className="notif-list">
            {severe.map((a) => <AlertCard key={a.id} alert={a} />)}
          </div>
        </section>
      )}

      {moderate.length > 0 && (
        <section className="notif-section">
          <h2 className="notif-section-title notif-section-title--moderate">
            <span aria-hidden="true">◈</span> Moderate Risk ({moderate.length})
          </h2>
          <div className="notif-list">
            {moderate.map((a) => <AlertCard key={a.id} alert={a} />)}
          </div>
        </section>
      )}
    </div>
  );
}
