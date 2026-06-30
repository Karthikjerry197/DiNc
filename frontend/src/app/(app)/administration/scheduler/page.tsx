'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchSchedulerStatus,
  runSchedulerNow,
  type SchedulerStatus,
} from '@/lib/api';
import { getCurrentUser, getToken } from '@/lib/session';
import ComingSoon from '@/components/shell/ComingSoon';

function dt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function interval(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  return `${Math.round(ms / 1000)}s`;
}

/**
 * Administration → Scheduler. Shows the automation engine's status, cumulative
 * metrics and recent run log, and lets administrators trigger a run for testing.
 * Administrators only.
 */
export default function SchedulerPage() {
  const user = getCurrentUser();
  const isAdmin = user?.role === 'ADMIN';

  const [data, setData] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    const token = getToken();
    if (!token) return setLoading(false);
    setLoading(true);
    fetchSchedulerStatus(token)
      .then((s) => { setData(s); setError(''); setLoading(false); })
      .catch((err) => { setError(err instanceof Error ? err.message : 'Unable to load scheduler.'); setLoading(false); });
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const runNow = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setRunning(true);
    try {
      const run = await runSchedulerNow(token);
      setToast(`Scheduler ran: ${run.dueFound} due · ${run.rulesProcessed} processed · ${run.escalations} escalated.`);
      setTimeout(() => setToast(''), 3200);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run the scheduler.');
    } finally {
      setRunning(false);
    }
  }, [load]);

  if (!isAdmin) {
    return <ComingSoon title="Scheduler" description="The automation engine is available to administrators only." />;
  }

  const t = data?.totals;
  const cards: { label: string; value: number | undefined; accent: string }[] = [
    { label: 'Total Runs', value: t?.runs, accent: '#1f2937' },
    { label: 'Activities Created', value: t?.activitiesCreated, accent: '#15803d' },
    { label: 'Retries Executed', value: t?.retries, accent: '#d97706' },
    { label: 'Escalations', value: t?.escalations, accent: '#b91c1c' },
    { label: 'Failures', value: t?.failures, accent: '#6b7280' },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <nav className="dq-breadcrumb" aria-label="Breadcrumb">
            <Link href="/administration">Administration</Link>
            <span aria-hidden="true"> / </span>
            <span>Scheduler</span>
          </nav>
          <h1 className="page-title">Scheduler &amp; Automation</h1>
          <p className="page-subtitle">
            {data
              ? `${data.enabled ? 'Enabled' : 'Disabled'} · runs every ${interval(data.intervalMs)}`
              : 'Loading…'}
          </p>
        </div>
        <div className="op-toolbar">
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={running}>↻ Refresh</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={runNow} disabled={running}>
            {running ? 'Running…' : '▶ Run Scheduler Now'}
          </button>
        </div>
      </div>

      {error && <div className="dash-error">{error}</div>}

      <div className="sched-exec-row">
        <div className="panel sched-exec">
          <div className="sched-exec-label">Last Execution</div>
          <div className="sched-exec-value">{dt(data?.lastRun?.startedAt ?? null)}</div>
          {data?.lastRun && (
            <div className="sched-exec-sub">
              {data.lastRun.trigger} · {data.lastRun.dueFound} due · {data.lastRun.rulesProcessed} processed
              {data.lastRun.failures > 0 ? ` · ${data.lastRun.failures} failed` : ''}
            </div>
          )}
        </div>
        <div className="panel sched-exec">
          <div className="sched-exec-label">Next Execution</div>
          <div className="sched-exec-value">{data?.enabled ? dt(data?.nextRunEstimate ?? null) : 'Disabled'}</div>
          <div className="sched-exec-sub">Automatic cycle</div>
        </div>
      </div>

      <section className="stat-grid sched-stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <div className="stat-card-value" style={{ color: c.accent }}>
              {loading || c.value === undefined ? '—' : c.value.toLocaleString()}
            </div>
            <div className="stat-card-label">{c.label}</div>
          </div>
        ))}
      </section>

      <div className="panel">
        <div className="panel-head"><h2 className="panel-title">Recent Runs</h2></div>
        {loading ? (
          <div className="dash-loading">Loading runs&hellip;</div>
        ) : !data || data.recentRuns.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">∅</div>
            <div className="empty-state-text">No scheduler runs recorded yet.</div>
          </div>
        ) : (
          <div className="wf-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Started</th><th>Trigger</th><th>Due</th><th>Processed</th>
                  <th>Created</th><th>Retries</th><th>Escalations</th><th>Failures</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRuns.map((r) => (
                  <tr key={r.id || r.startedAt}>
                    <td>{dt(r.startedAt)}</td>
                    <td><span className={`pill ${r.trigger === 'MANUAL' ? 'pill-normal' : 'pill-low'}`}>{r.trigger}</span></td>
                    <td>{r.dueFound}</td>
                    <td>{r.rulesProcessed}</td>
                    <td>{r.activitiesCreated}</td>
                    <td>{r.retries}</td>
                    <td>{r.escalations}</td>
                    <td>{r.failures > 0 ? <span className="bu-err">{r.failures}</span> : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <div className="cz-toast">{toast}</div>}
    </div>
  );
}
