'use client';

import { useEffect, useState } from 'react';
import {
  fetchOperationsDashboard,
  type AnalyticsQueryParams,
  type OperationsDashboard,
} from '@/lib/api';
import { ProgressBar } from './Charts';

interface Props {
  token: string;
  params: AnalyticsQueryParams;
  isAdmin: boolean;
}

// ── Reusable primitives ────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  accent,
  note,
}: {
  label: string;
  value: number;
  accent?: string;
  note?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-value" style={accent ? { color: accent } : undefined}>
        {value.toLocaleString()}
      </div>
      <div className="stat-card-label">{label}</div>
      {note && <div className="an-null" style={{ marginTop: 4 }}>{note}</div>}
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="ops-section-head">
      <h2 className="ops-section-title">{title}</h2>
      {sub && <span className="an-null">{sub}</span>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * Operations Dashboard — a focused, actionable view for Medical Officers,
 * Programme Managers and Supervisors. Shows what requires attention today.
 *
 * Reuses: stat-card, data-table, panel, ProgressBar (all from existing analytics).
 * Calls: GET /analytics/operations (single round-trip, no duplicate SQL).
 * Read-only: no writes, no workflow changes.
 */
export default function OperationsSection({ token, params, isAdmin }: Props) {
  const [data, setData] = useState<OperationsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    fetchOperationsDashboard(token, params)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : 'Unable to load.'); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, JSON.stringify(params)]);

  if (loading) return <div className="rp-loading">Loading operations dashboard&hellip;</div>;
  if (error)   return <div className="rp-error">{error}</div>;
  if (!data)   return null;

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="ops-dashboard">

      <div className="ops-as-of">Operations snapshot &middot; {today}</div>

      {/* ── 1. Today's Work ─────────────────────────────────────────────── */}
      <SectionHead
        title="Today's Work"
        sub="Activities requiring action now"
      />
      <div className="stat-grid an-kpi-4" style={{ marginBottom: 20 }}>
        <KpiCard
          label="Due Today"
          value={data.dueToday}
          accent={data.dueToday > 0 ? '#b45309' : undefined}
        />
        <KpiCard
          label="Overdue"
          value={data.overdueActivities}
          accent={data.overdueActivities > 0 ? '#b91c1c' : undefined}
        />
        <KpiCard
          label="High Priority"
          value={data.highPriorityActivities}
          accent={data.highPriorityActivities > 0 ? '#7c3aed' : undefined}
        />
        <KpiCard
          label="Escalated"
          value={data.escalatedActivities}
          accent={data.escalatedActivities > 0 ? '#b91c1c' : undefined}
          note={data.escalatedActivities > 0 ? 'Requires immediate attention' : undefined}
        />
      </div>

      {/* ── 2. Population Summary ────────────────────────────────────────── */}
      <SectionHead
        title="Population Summary"
        sub="Registered citizens and active enrolments"
      />
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <KpiCard label="Total Citizens" value={data.totalCitizens} />
        <KpiCard label="Active Enrolments" value={data.activeEnrollments} accent="#0284c7" />
        <KpiCard label="New Registrations Today" value={data.newRegistrationsToday} accent="#15803d" />
      </div>

      {data.programs.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <span className="panel-title" style={{ fontSize: 12 }}>Enrolments by Programme</span>
          </div>
          <div className="ops-enrol-list">
            {data.programs.map((p) => (
              <div key={p.programId} className="ops-enrol-row">
                <span className="ops-enrol-name">{p.program}</span>
                <span className="ops-enrol-val">{p.activeEnrollments.toLocaleString()} active</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3. Consultation Summary ──────────────────────────────────────── */}
      <SectionHead
        title="Consultation Summary"
        sub="Today's consultation activity"
      />
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <KpiCard
          label="Completed Today"
          value={data.consultationsCompletedToday}
          accent="#15803d"
        />
        <KpiCard
          label="In Progress"
          value={data.consultationsPending}
          accent={data.consultationsPending > 0 ? '#0284c7' : undefined}
        />
        <KpiCard
          label="Referrals Today"
          value={data.referralsToday}
          accent={data.referralsToday > 0 ? '#7c3aed' : undefined}
          note={data.referralsToday > 0 ? 'ESCALATION outcomes' : undefined}
        />
      </div>

      {/* ── 4. Programme Summary ─────────────────────────────────────────── */}
      {data.programs.length > 0 && (
        <>
          <SectionHead
            title="Programme Summary"
            sub={`${data.programs.length} active programme${data.programs.length !== 1 ? 's' : ''}`}
          />
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="wf-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Programme</th>
                    <th style={{ textAlign: 'right' }}>Active Citizens</th>
                    <th style={{ textAlign: 'right' }}>Due / Pending</th>
                    <th style={{ textAlign: 'right' }}>Overdue</th>
                    <th style={{ textAlign: 'right' }}>Completed</th>
                    <th style={{ minWidth: 120 }}>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.programs.map((p) => (
                    <tr key={p.programId}>
                      <td style={{ fontWeight: 600 }}>{p.program}</td>
                      <td style={{ textAlign: 'right' }}>{p.activeEnrollments.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>{p.pendingActivities.toLocaleString()}</td>
                      <td
                        style={{ textAlign: 'right' }}
                        className={p.overdueActivities > 0 ? 'an-hi-red' : ''}
                      >
                        {p.overdueActivities.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right' }} className="an-hi-green">
                        {p.completedActivities.toLocaleString()}
                      </td>
                      <td>
                        <div className="an-rate">
                          <span className="an-rate-pct">{p.completionRate}%</span>
                          <span className="an-rate-bar">
                            <ProgressBar
                              value={p.completionRate}
                              color={
                                p.completionRate >= 80
                                  ? '#15803d'
                                  : p.completionRate >= 50
                                    ? '#d97706'
                                    : '#b91c1c'
                              }
                            />
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── 5. Worker Performance ────────────────────────────────────────── */}
      <SectionHead
        title="Worker Performance"
        sub={isAdmin ? `${data.workers.length} worker${data.workers.length !== 1 ? 's' : ''}` : undefined}
      />
      {!isAdmin ? (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">🔒</div>
            <div className="empty-state-text">Worker performance is available to administrators only.</div>
          </div>
        </div>
      ) : data.workers.length === 0 ? (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">👥</div>
            <div className="empty-state-text">No worker data for the selected filters.</div>
          </div>
        </div>
      ) : (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="wf-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th style={{ textAlign: 'right' }}>Assigned</th>
                  <th style={{ textAlign: 'right' }}>Completed</th>
                  <th style={{ textAlign: 'right' }}>Pending</th>
                  <th style={{ textAlign: 'right' }}>Overdue</th>
                  <th style={{ minWidth: 120 }}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.workers.map((w) => (
                  <tr key={w.username}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{w.fullName}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{w.username}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>{w.assigned.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }} className="an-hi-green">
                      {w.completed.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>{w.pending.toLocaleString()}</td>
                    <td
                      style={{ textAlign: 'right' }}
                      className={w.overdue > 0 ? 'an-hi-red' : ''}
                    >
                      {w.overdue.toLocaleString()}
                    </td>
                    <td>
                      <div className="an-rate">
                        <span className="an-rate-pct">{w.completionRate}%</span>
                        <span className="an-rate-bar">
                          <ProgressBar
                            value={w.completionRate}
                            color={
                              w.completionRate >= 80
                                ? '#15803d'
                                : w.completionRate >= 50
                                  ? '#d97706'
                                  : '#b91c1c'
                            }
                          />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
