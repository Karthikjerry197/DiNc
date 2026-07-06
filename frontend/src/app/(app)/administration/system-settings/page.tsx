'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  fetchSystemSettings,
  fetchSchedulerStatus,
  runSchedulerNow,
  type SystemSettings,
  type SchedulerStatus,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useUser } from '@/lib/UserContext';
import ComingSoon from '@/components/shell/ComingSoon';
import { Play, RefreshCw, ShieldCheck, Timer, UserRound, UsersRound, Workflow } from 'lucide-react';

function dt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** "8h" / "30m" / "7d" → a human phrase for administrators. */
function friendlyLifetime(v: string): string {
  const m = /^(\d+)\s*([hmd])$/i.exec(v.trim());
  if (!m) return v;
  const n = Number(m[1]);
  const unit = { h: 'hour', m: 'minute', d: 'day' }[m[2].toLowerCase()] ?? '';
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

function schedulerInterval(ms: number): string {
  if (ms % 3_600_000 === 0) return `every ${ms / 3_600_000} hour${ms / 3_600_000 === 1 ? '' : 's'}`;
  if (ms % 60_000 === 0) return `every ${ms / 60_000} minute${ms / 60_000 === 1 ? '' : 's'}`;
  return `every ${Math.round(ms / 1000)} seconds`;
}

const QUICK_LINKS = [
  { label: 'Users & Roles', href: '/administration/users', icon: <UsersRound size={16} /> },
  { label: 'Workflow Rules', href: '/administration/workflow-rules', icon: <Workflow size={16} /> },
  { label: 'Scheduler', href: '/administration/scheduler', icon: <Timer size={16} /> },
  { label: 'Data Quality', href: '/administration/data-quality', icon: <ShieldCheck size={16} /> },
  { label: 'Account Settings', href: '/administration/account-settings', icon: <UserRound size={16} /> },
];

/**
 * Administration → System Settings. A unified, administrator-facing view of
 * system-wide configuration that already exists elsewhere — it does not
 * duplicate or re-store those settings. Every section is read-only; Organization
 * shows the backend configuration defaults until a shared persistence mechanism
 * exists. Administrators only.
 */
export default function SystemSettingsPage() {
  const { can } = useUser();
  const isAdmin = can('admin.pages');

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState('');

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  };

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const load = useCallback(() => {
    const token = getToken();
    if (!token) return setLoading(false);
    setLoading(true);
    Promise.all([fetchSystemSettings(token), fetchSchedulerStatus(token)])
      .then(([s, sched]) => {
        setSettings(s);
        setScheduler(sched);
        setError('');
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load system settings.');
        setLoading(false);
      });
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const runNow = useCallback(async () => {
    if (running) return;
    const token = getToken();
    if (!token) return;
    setRunning(true);
    try {
      const run = await runSchedulerNow(token);
      flash(`Scheduler ran: ${run.dueFound} due · ${run.rulesProcessed} processed · ${run.escalations} escalated.`);
      const sched = await fetchSchedulerStatus(token);
      setScheduler(sched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run the scheduler.');
    } finally {
      setRunning(false);
    }
  }, [running]);

  if (!isAdmin) {
    return (
      <ComingSoon
        title="System Settings"
        description="System configuration is available to administrators only."
      />
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <nav className="dq-breadcrumb" aria-label="Breadcrumb">
            <Link href="/administration">Administration</Link>
            <span aria-hidden="true"> / </span>
            <span>System Settings</span>
          </nav>
          <h1 className="page-title">System Settings</h1>
          <p className="page-subtitle">A unified view of system-wide configuration.</p>
        </div>
        <button type="button" className="btn btn-ghost dq-refresh" onClick={load} disabled={loading}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </button>
      </div>

      {error && <div className="dash-error">{error}</div>}

      {/* Organization — read-only (backend configuration defaults) */}
      <div className="panel">
        <div className="panel-head"><h2 className="panel-title">Organization</h2></div>
        <dl className="ss-kv">
          <div><dt>Organization Name</dt><dd>{settings?.organization.name ?? '—'}</dd></div>
          <div><dt>Facility</dt><dd>{settings?.organization.facility || '—'}</dd></div>
          <div><dt>District</dt><dd>{settings?.organization.district || '—'}</dd></div>
          <div><dt>Contact Email</dt><dd>{settings?.organization.contactEmail || '—'}</dd></div>
        </dl>
      </div>

      {/* Application + Security — read-only */}
      <div className="ss-two-col">
        <div className="panel">
          <div className="panel-head"><h2 className="panel-title">Application</h2></div>
          <dl className="ss-kv">
            <div><dt>Application</dt><dd>{settings?.application.name ?? '—'}</dd></div>
            <div><dt>Version</dt><dd>{settings ? `v${settings.application.version}` : '—'}</dd></div>
            <div><dt>Environment</dt><dd>{settings?.application.environment ?? '—'}</dd></div>
          </dl>
        </div>
        <div className="panel">
          <div className="panel-head"><h2 className="panel-title">Security</h2></div>
          <dl className="ss-kv">
            <div>
              <dt>Session Timeout</dt>
              <dd>{settings ? `Sessions expire after ${friendlyLifetime(settings.security.sessionLifetime)}` : '—'}</dd>
            </div>
            <div>
              <dt>Password Policy</dt>
              <dd>{settings ? `Minimum ${settings.security.passwordMinLength} characters` : '—'}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Scheduler — read-only summary + Run Now (reuses the scheduler engine) */}
      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Scheduler</h2>
          <div className="op-toolbar">
            <Link href="/administration/scheduler" className="btn btn-ghost btn-sm">Open Scheduler</Link>
            <button type="button" className="btn btn-primary btn-sm" onClick={runNow} disabled={running}>
              {running ? 'Running…' : <><Play size={13} aria-hidden="true" /> Run Now</>}
            </button>
          </div>
        </div>
        <dl className="ss-kv">
          <div>
            <dt>Status</dt>
            <dd>
              {scheduler
                ? `${scheduler.enabled ? 'Enabled' : 'Disabled'}${scheduler.enabled ? ` · runs ${schedulerInterval(scheduler.intervalMs)}` : ''}`
                : '—'}
            </dd>
          </div>
          <div><dt>Last Run</dt><dd>{dt(scheduler?.lastRun?.startedAt ?? null)}</dd></div>
          <div>
            <dt>Next Run</dt>
            <dd>{scheduler?.enabled ? dt(scheduler?.nextRunEstimate ?? null) : 'Disabled'}</dd>
          </div>
          <div><dt>Total Runs</dt><dd>{scheduler?.totals.runs ?? '—'}</dd></div>
        </dl>
      </div>

      {/* Quick Links */}
      <div className="panel">
        <div className="panel-head"><h2 className="panel-title">Related Administration</h2></div>
        <div className="ss-links">
          {QUICK_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="ss-link">
              <span className="ss-link-icon" aria-hidden="true">{l.icon}</span>
              <span>{l.label}</span>
              <span className="ss-link-go" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </div>

      {toast && <div className="cz-toast" role="status">{toast}</div>}
    </div>
  );
}
