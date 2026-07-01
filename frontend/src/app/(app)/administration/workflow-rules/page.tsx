'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  fetchWorkflowRules,
  type WorkflowRule,
  type WorkflowRulesOverview,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useUser } from '@/lib/UserContext';
import ComingSoon from '@/components/shell/ComingSoon';
import RuleEditorDialog from '@/components/workflow/RuleEditorDialog';

function value(text: string | null): string {
  return text && text.trim() ? text : '—';
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
        <button type="button" className="btn btn-ghost dq-refresh" onClick={load}>↻ Refresh</button>
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
          <div className="dash-loading">Loading workflow rules&hellip;</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">∅</div>
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
                  <th>Retry Policy</th>
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
                    <td>{value(r.nextActivity)}</td>
                    <td>{r.delayDays === 0 ? 'Same day' : `${r.delayDays}d`}</td>
                    <td><span className={`pill pill-${r.priority.toLowerCase()}`}>{r.priority}</span></td>
                    <td>{value(r.retryPolicy)}</td>
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
            setTimeout(() => setToast(''), 2600);
            load();
          }}
        />
      )}

      {toast && <div className="cz-toast">{toast}</div>}
    </div>
  );
}
