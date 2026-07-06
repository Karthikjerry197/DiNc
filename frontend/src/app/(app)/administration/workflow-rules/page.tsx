'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  fetchWorkflowRules,
  type WorkflowRule,
  type WorkflowRulesOverview,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { displayValue as value } from '@/lib/format';
import { useUser } from '@/lib/UserContext';
import ComingSoon from '@/components/shell/ComingSoon';
import RuleEditorDialog from '@/components/workflow/RuleEditorDialog';
import { Inbox, RefreshCw } from 'lucide-react';
import { SkeletonTable } from '@/components/shell/Skeleton';

// Which actions actually consume Delay / Next Activity at execution time
// (mirrors WorkflowEngine). Cells for actions that ignore a field show '—'.
const DELAY_ACTIONS = new Set([
  'COMPLETE_AND_ADVANCE', 'CREATE_ACTIVITY', 'RESCHEDULE_ACTIVITY', 'CREATE_REFERRAL',
]);
const NEXT_ACTIVITY_ACTIONS = new Set([
  'COMPLETE_AND_ADVANCE', 'CREATE_ACTIVITY', 'CREATE_REFERRAL',
]);
// Only RESCHEDULE_ACTIVITY applies the rule's priority to the created activity;
// every other action creates its activity at the default priority.
const PRIORITY_ACTIONS = new Set(['RESCHEDULE_ACTIVITY']);

/**
 * Action-specific "Retry / Escalation" summary for the list. RETRY_ACTIVITY
 * shows the effective retry_config (its real timing), ESCALATE / SEND_NOTIFICATION
 * show the target role; other actions have nothing retry-related to show.
 */
function actionDetail(r: WorkflowRule): string {
  switch (r.action) {
    case 'RETRY_ACTIVITY': {
      const rc = r.retryConfig;
      return rc
        ? `Retry every ${rc.retryIntervalHours}h · Max ${rc.maxAttempts} · Escalates after ${rc.escalationAfterAttempts}`
        : 'Default retry policy';
    }
    case 'ESCALATE':
      return r.escalationRole ? `Escalates to ${r.escalationRole}` : 'Escalates (no role set)';
    case 'SEND_NOTIFICATION':
      return r.notificationRole ? `Notifies ${r.notificationRole}` : '—';
    default:
      return '—';
  }
}

/**
 * Administration → Workflow Rules. Displays every workflow rule (resolved to
 * human-readable values — never UUIDs) and lets administrators edit the action,
 * next activity, delay, priority, retry policy and active flag. Administrators
 * only. All workflow behaviour is configured here, not in code.
 */
export default function WorkflowRulesPage() {
  const { can } = useUser();
  const isAdmin = can('admin.workflow');

  const [data, setData] = useState<WorkflowRulesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<WorkflowRule | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const load = useCallback(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchWorkflowRules(token)
      .then((overview) => {
        setData(overview);
        setError('');
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load workflow rules.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.rules;
    return data.rules.filter(
      (r) =>
        r.outcome.toLowerCase().includes(q) ||
        (r.forEvent ?? '').toLowerCase().includes(q) ||
        (r.action ?? '').toLowerCase().includes(q) ||
        (r.nextActivity ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  if (!isAdmin) {
    return (
      <ComingSoon
        title="Workflow Rules"
        description="Workflow configuration is available to administrators only."
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
            <span>Workflow Rules</span>
          </nav>
          <h1 className="page-title">Workflow Rules</h1>
          <p className="page-subtitle">
            {data ? `${data.rules.length} rules · ${data.retryConfigs.length} retry policies` : 'Loading…'}
          </p>
        </div>
        <button type="button" className="btn btn-ghost dq-refresh" onClick={load}><RefreshCw size={13} aria-hidden="true" /> Refresh</button>
      </div>

      {error && <div className="dash-error">{error}</div>}

      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Outcome → Workflow</h2>
          <input
            className="fc wf-search"
            placeholder="Search outcome, event or action…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <SkeletonTable rows={8} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
            <div className="empty-state-text">No workflow rules match your search.</div>
          </div>
        ) : (
          <div className="wf-table-wrap">
            <table className="data-table wf-table">
              <thead>
                <tr>
                  <th>Outcome</th>
                  <th>For Event</th>
                  <th>Workflow Action</th>
                  <th>Next Activity</th>
                  <th>Delay</th>
                  <th>Priority</th>
                  <th>Retry / Escalation</th>
                  <th>Active</th>
                  <th className="wf-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="wf-outcome">{r.outcome}</span>
                      <span className={`pill wf-cat-${r.category.toLowerCase()}`}>{r.category}</span>
                    </td>
                    <td>{value(r.forEvent)}</td>
                    <td><span className="wf-action">{value(r.action).replace(/_/g, ' ')}</span></td>
                    <td>{NEXT_ACTIVITY_ACTIONS.has(r.action) ? value(r.nextActivity) : '—'}</td>
                    <td>
                      {DELAY_ACTIONS.has(r.action)
                        ? (r.delayDays === 0 ? 'Same day' : `${r.delayDays}d`)
                        : '—'}
                    </td>
                    <td>
                      {PRIORITY_ACTIONS.has(r.action)
                        ? <span className={`pill pill-${r.priority.toLowerCase()}`}>{r.priority}</span>
                        : '—'}
                    </td>
                    <td>{actionDetail(r)}</td>
                    <td>
                      <span className={`pill ${r.isActive ? 'pill-active' : 'pill-inactive'}`}>
                        {r.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="wf-col-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(r)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.retryConfigs.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Retry Policies</h2>
          </div>
          <div className="wf-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Condition</th>
                  <th>Max Attempts</th>
                  <th>Retry Interval</th>
                  <th>Escalate After</th>
                  <th>Escalation Role</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {data.retryConfigs.map((rc) => (
                  <tr key={rc.id}>
                    <td>{value(rc.program)}</td>
                    <td>{value(rc.disease)}</td>
                    <td>{rc.maxAttempts}</td>
                    <td>{rc.retryIntervalHours}h</td>
                    <td>{rc.escalationAfterAttempts}</td>
                    <td>{value(rc.escalationRole)}</td>
                    <td>
                      <span className={`pill ${rc.isActive ? 'pill-active' : 'pill-inactive'}`}>
                        {rc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && data && (
        <RuleEditorDialog
          rule={editing}
          options={data.options}
          open={editing !== null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setToast('Workflow rule updated.');
            if (toastTimer.current) clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setToast(''), 2600);
            load();
          }}
        />
      )}

      {toast && <div className="cz-toast" role="status">{toast}</div>}
    </div>
  );
}
