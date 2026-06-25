'use client';

import { useEffect, useState } from 'react';
import {
  fetchAdminDashboard,
  type AdminDashboardSummary,
} from '@/lib/api';
import { getToken } from '@/lib/session';

/** Formats a count for a stat card; `null` (unavailable) renders an em dash. */
function statValue(value: number | null): string {
  return value === null ? '—' : value.toLocaleString();
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface StatCardDef {
  label: string;
  value: number | null;
  hint?: string;
  accent: string;
  icon: string;
}

const ACTIVITY_ICON: Record<string, string> = {
  CITIZEN: '👤',
  ENROLLMENT: '📝',
  WORKLIST: '☑',
  NOTIFICATION: '🔔',
};

export default function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const token = getToken();

    if (!token) {
      // No authenticated session (e.g. guest): show empty states, never fake data.
      setLoading(false);
      return;
    }

    fetchAdminDashboard(token)
      .then((summary) => {
        if (active) {
          setData(summary);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to load dashboard data.');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="dash-loading">Loading dashboard&hellip;</div>
      </div>
    );
  }

  const stats = data?.stats;
  const cards: StatCardDef[] = [
    { label: 'Registered Citizens', value: stats?.registeredCitizens ?? null, accent: '#24a148', icon: '👥' },
    {
      label: 'Active Enrollments',
      value: stats?.activeEnrollments ?? null,
      hint: stats?.totalEnrollments != null ? `${stats.totalEnrollments.toLocaleString()} total` : undefined,
      accent: '#0284c7',
      icon: '📋',
    },
    { label: 'Programs', value: stats?.programs ?? null, accent: '#7c3aed', icon: '🗂' },
    { label: 'Sub Programs', value: stats?.subPrograms ?? null, accent: '#db2777', icon: '🔖' },
    { label: 'Knowledge Assets', value: stats?.knowledgeAssets ?? null, accent: '#d97706', icon: '📚' },
    { label: 'CPHC Services', value: stats?.cphcServices ?? null, accent: '#059669', icon: '🩺' },
    { label: 'Pending Notifications', value: stats?.pendingNotifications ?? null, accent: '#0891b2', icon: '🔔' },
    {
      label: 'Pending Tasks',
      value: stats?.pendingTasks ?? null,
      hint: stats?.overdueTasks != null ? `${stats.overdueTasks.toLocaleString()} overdue` : undefined,
      accent: '#dc2626',
      icon: '⏱',
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Administrator overview · live system summary</p>
        </div>
      </div>

      {error && <div className="dash-error">{error}</div>}

      <section className="stat-grid">
        {cards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="stat-card-top">
              <span className="stat-card-icon" style={{ background: `${card.accent}1a`, color: card.accent }}>
                {card.icon}
              </span>
              {card.hint && <span className="stat-card-hint">{card.hint}</span>}
            </div>
            <div className="stat-card-value">{statValue(card.value)}</div>
            <div className="stat-card-label">{card.label}</div>
          </div>
        ))}
      </section>

      <div className="dash-columns">
        <div className="dash-col-main">
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Worklist Overview</h2>
            </div>
            <div className="worklist-stats">
              <div className="worklist-stat">
                <span className="worklist-stat-value" style={{ color: '#d97706' }}>
                  {statValue(data?.worklist.pending ?? null)}
                </span>
                <span className="worklist-stat-label">Pending</span>
              </div>
              <div className="worklist-stat">
                <span className="worklist-stat-value" style={{ color: '#dc2626' }}>
                  {statValue(data?.worklist.overdue ?? null)}
                </span>
                <span className="worklist-stat-label">Overdue</span>
              </div>
              <div className="worklist-stat">
                <span className="worklist-stat-value" style={{ color: '#24a148' }}>
                  {statValue(data?.worklist.completed ?? null)}
                </span>
                <span className="worklist-stat-label">Completed</span>
              </div>
            </div>

            {data && data.recentWorklist.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>UHID</th>
                    <th>Citizen</th>
                    <th>Activity</th>
                    <th>Due</th>
                    <th>Priority</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentWorklist.map((row, i) => (
                    <tr key={i}>
                      <td className="mono">{row.uhid ?? '—'}</td>
                      <td>{row.citizen ?? '—'}</td>
                      <td>{row.activity ?? '—'}</td>
                      <td>{formatDate(row.dueDate)}</td>
                      <td>
                        <span className={`pill pill-${row.priority.toLowerCase()}`}>{row.priority}</span>
                      </td>
                      <td>
                        <span className={`pill pill-${row.status.toLowerCase()}`}>{row.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState text="No worklist items to display." />
            )}
          </div>
        </div>

        <div className="dash-col-side">
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">CPHC Services</h2>
            </div>
            {data && data.services.length > 0 ? (
              <div className="service-grid">
                {data.services.map((service) => (
                  <div key={service.name} className="service-chip">
                    <span
                      className="service-dot"
                      style={{ background: service.color ?? '#24a148' }}
                      aria-hidden="true"
                    />
                    <span className="service-name">{service.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="No active services configured." />
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Recent Activity</h2>
            </div>
            {data && data.recentActivity.length > 0 ? (
              <ul className="activity-list">
                {data.recentActivity.map((item, i) => (
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
            ) : (
              <EmptyState text="No recent activity." />
            )}
          </div>
        </div>
      </div>
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
