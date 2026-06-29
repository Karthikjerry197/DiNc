'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchAdminDashboard,
  fetchWorklistItemGuidebook,
  fetchWorklistOverview,
  type AdminDashboardSummary,
  type WorklistItem,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import ReportDuplicateDialog, {
  type ReportDuplicateTarget,
} from '@/components/dataquality/ReportDuplicateDialog';
import TeleconsultationWindow from '@/components/consultation/TeleconsultationWindow';
import PatientActions from '@/components/patients/PatientActions';

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

function value(text: string | null): string {
  return text && text.trim() ? text : '—';
}

/** End of the current local day, used to flag follow-ups due today or overdue. */
function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
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
  const router = useRouter();
  const [data, setData] = useState<AdminDashboardSummary | null>(null);
  const [worklist, setWorklist] = useState<WorklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportTarget, setReportTarget] = useState<ReportDuplicateTarget | null>(null);
  const [consultActivityId, setConsultActivityId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  // Reuse both existing read APIs: the dashboard summary (KPIs, services,
  // programs, activity) and the worklist overview (follow-up items). Exposed as a
  // callable so it can refresh automatically after a consultation completes.
  const load = useCallback(() => {
    const token = getToken();
    if (!token) {
      // No authenticated session (e.g. guest): show empty states, never fake data.
      setLoading(false);
      return;
    }
    Promise.all([fetchAdminDashboard(token), fetchWorklistOverview(token)])
      .then(([summary, overview]) => {
        setData(summary);
        setWorklist(overview.items);
        setLoading(false);
      })
      .catch(() => {
        setError('Unable to load dashboard data.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Today's follow-up worklist: pending items due today or overdue. When none
  // qualify, fall back to the nearest upcoming pending items so the worklist is
  // never needlessly empty.
  const followups = useMemo(() => {
    const pending = worklist.filter((i) => i.status.toUpperCase() === 'PENDING');
    const cutoff = endOfToday();
    const due = pending.filter(
      (i) => i.dueDate && new Date(i.dueDate).getTime() <= cutoff,
    );
    return (due.length > 0 ? due : pending).slice(0, 12);
  }, [worklist]);

  // Always open the guidebook for THIS item's enrollment/activity. When no
  // curated guidebook matches the item's clinical context, surface a notice
  // rather than dropping the user on the generic Guidebooks landing page.
  const openGuidebook = useCallback(
    async (itemId: string) => {
      const token = getToken();
      if (!token) {
        flash('Your session has expired. Please sign in again.');
        return;
      }
      try {
        const guidebook = await fetchWorklistItemGuidebook(token, itemId);
        if (guidebook) {
          router.push(`/guidebooks?g=${guidebook.id}`);
        } else {
          flash('No specific guidebook is mapped to this activity.');
        }
      } catch {
        flash('Unable to open the guidebook for this activity.');
      }
    },
    [router, flash],
  );

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
          <p className="page-subtitle">Operations command centre · live system summary</p>
        </div>
      </div>

      <section className="panel quick-actions-panel">
        <div className="panel-head">
          <h2 className="panel-title">Quick Actions</h2>
        </div>
        <PatientActions
          variant="dashboard"
          includeNavShortcuts
          onChanged={load}
          onToast={flash}
        />
      </section>

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
          <div className="panel dash-worklist-panel">
            <div className="panel-head">
              <h2 className="panel-title">Today&apos;s Follow-up Worklist</h2>
            </div>

            <div className="consult-stat-row">
              <ConsultStat label="Completed Today" value={data?.worklist.completedToday ?? null} accent="#15803d" />
              <ConsultStat label="Pending" value={data?.worklist.pending ?? null} accent="#d97706" />
              <ConsultStat label="Overdue" value={data?.worklist.overdue ?? null} accent="#dc2626" />
              <ConsultStat label="Referred" value={data?.worklist.referred ?? null} accent="#1d4ed8" />
              <ConsultStat label="No Answer" value={data?.worklist.noAnswer ?? null} accent="#6b7280" />
              <ConsultStat label="Emergency" value={data?.worklist.emergencyReferrals ?? null} accent="#b91c1c" />
            </div>

            {followups.length > 0 ? (
              <div className="dash-worklist-wrap">
                <table className="data-table dash-worklist-table">
                  <thead>
                    <tr>
                      <th>UHID</th>
                      <th>Program</th>
                      <th>Activity</th>
                      <th>Due Date</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th className="dash-col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followups.map((item) => (
                      <tr key={item.id}>
                        <td className="mono">{value(item.uhid)}</td>
                        <td>{value(item.program)}</td>
                        <td>{value(item.activity)}</td>
                        <td>{formatDate(item.dueDate)}</td>
                        <td>
                          <span className={`pill pill-${item.priority.toLowerCase()}`}>{item.priority}</span>
                        </td>
                        <td>
                          <span className={`pill pill-${item.status.toLowerCase()}`}>{item.status}</span>
                        </td>
                        <td className="dash-col-actions">
                          <div className="dash-row-actions">
                            <button
                              type="button"
                              className="wl-icon-btn"
                              title="Open the guidebook for this patient's activity"
                              aria-label="Guidebook"
                              onClick={() => openGuidebook(item.id)}
                            >
                              📖
                            </button>
                            <button
                              type="button"
                              className="wl-icon-btn"
                              title="Start teleconsultation"
                              aria-label="Call"
                              onClick={() => setConsultActivityId(item.id)}
                            >
                              📞
                            </button>
                            <button
                              type="button"
                              className="wl-icon-btn"
                              title="Open patient workspace"
                              aria-label="Open Patient"
                              disabled={!item.citizenId}
                              onClick={() =>
                                item.citizenId && router.push(`/citizens?c=${item.citizenId}`)
                              }
                            >
                              👁
                            </button>
                            <button
                              type="button"
                              className="wl-icon-btn"
                              title="Report a possible duplicate patient"
                              aria-label="Report Duplicate"
                              disabled={!item.citizenId}
                              onClick={() =>
                                item.citizenId &&
                                setReportTarget({
                                  id: item.citizenId,
                                  uhid: item.uhid,
                                  fullName: item.citizen,
                                })
                              }
                            >
                              ⚠
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState text="No follow-up items to display." />
            )}
          </div>
        </div>

        <div className="dash-col-side">
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Programs Summary</h2>
            </div>
            {data && data.programs.length > 0 ? (
              <ul className="program-summary-list">
                {data.programs.map((p) => (
                  <li key={p.name} className="program-summary-item">
                    <span className="program-summary-name">{p.name}</span>
                    <span className="program-summary-count">{p.activeEnrollments.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState text="No active programs." />
            )}
          </div>

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

      {reportTarget && (
        <ReportDuplicateDialog
          current={reportTarget}
          open={reportTarget !== null}
          onClose={() => setReportTarget(null)}
          onSubmitted={(request) => {
            setReportTarget(null);
            flash(`Duplicate request ${request.reference} submitted for review.`);
          }}
        />
      )}

      {consultActivityId && (
        <TeleconsultationWindow
          activityId={consultActivityId}
          open={consultActivityId !== null}
          onClose={() => setConsultActivityId(null)}
          onCompleted={(result) => {
            setConsultActivityId(null);
            flash(
              result.nextActivity
                ? 'Consultation saved · next activity scheduled.'
                : 'Consultation saved.',
            );
            // Dashboard + worklist stats refresh automatically — no manual reload.
            load();
          }}
        />
      )}

      {toast && <div className="cz-toast">{toast}</div>}
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

function ConsultStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | null;
  accent: string;
}) {
  return (
    <div className="consult-stat">
      <span className="consult-stat-value" style={{ color: accent }}>{statValue(value)}</span>
      <span className="consult-stat-label">{label}</span>
    </div>
  );
}
