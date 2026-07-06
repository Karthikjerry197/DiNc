'use client';

import { useState } from 'react';
import {
  updateWorkflowRule,
  type UpdateRulePayload,
  type WorkflowRule,
  type WorkflowRulesOverview,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useDialogA11y } from '@/lib/useDialogA11y';

interface RuleEditorDialogProps {
  rule: WorkflowRule;
  options: WorkflowRulesOverview['options'];
  open: boolean;
  onClose: () => void;
  onSaved: (rule: WorkflowRule) => void;
}

const NONE = '';

/**
 * Which editable fields each workflow action actually consumes at execution
 * time (mirrors WorkflowEngine — the source of truth). Fields an action ignores
 * are hidden so administrators never configure inert values. RETRY_ACTIVITY
 * shows a read-only retry_config block instead of Delay/Next Activity, because
 * its timing comes from retry_config (per program + disease), not delay_days.
 */
interface FieldCaps {
  nextActivity: boolean;
  delay: boolean;
  /** Only RESCHEDULE_ACTIVITY passes the rule's priority to the new activity. */
  priority: boolean;
  retryInfo: boolean;
  escalationRole: boolean;
  notificationRole: boolean;
  /** Actions that create a new activity can stamp a responsible role (M31). */
  assignedRole: boolean;
}

const ACTION_CAPS: Record<string, FieldCaps> = {
  COMPLETE_AND_ADVANCE: { nextActivity: true, delay: true, priority: false, retryInfo: false, escalationRole: false, notificationRole: false, assignedRole: true },
  CREATE_ACTIVITY: { nextActivity: true, delay: true, priority: false, retryInfo: false, escalationRole: false, notificationRole: false, assignedRole: true },
  RESCHEDULE_ACTIVITY: { nextActivity: false, delay: true, priority: true, retryInfo: false, escalationRole: false, notificationRole: false, assignedRole: true },
  RETRY_ACTIVITY: { nextActivity: false, delay: false, priority: false, retryInfo: true, escalationRole: false, notificationRole: false, assignedRole: false },
  CREATE_REFERRAL: { nextActivity: true, delay: true, priority: false, retryInfo: false, escalationRole: false, notificationRole: true, assignedRole: true },
  HOLD_PROGRAM: { nextActivity: false, delay: false, priority: false, retryInfo: false, escalationRole: false, notificationRole: false, assignedRole: false },
  CLOSE_PROGRAM: { nextActivity: false, delay: false, priority: false, retryInfo: false, escalationRole: false, notificationRole: false, assignedRole: false },
  ESCALATE: { nextActivity: false, delay: false, priority: false, retryInfo: false, escalationRole: true, notificationRole: false, assignedRole: false },
  SEND_NOTIFICATION: { nextActivity: false, delay: false, priority: false, retryInfo: false, escalationRole: false, notificationRole: true, assignedRole: false },
};

// Unknown/extension actions: show the editable fields rather than hide silently.
const DEFAULT_CAPS: FieldCaps = {
  nextActivity: true, delay: true, priority: true, retryInfo: false, escalationRole: true, notificationRole: true, assignedRole: true,
};

/**
 * Rule Editor — lets administrators reconfigure what happens after an outcome
 * WITHOUT touching SQL. Action-aware: only the fields the selected action truly
 * uses are shown, so the form accurately reflects the (unchanged) engine. The
 * outcome a rule fires for is its identity and is read-only. Fields not shown
 * for the current action keep their stored value untouched on save.
 */
export default function RuleEditorDialog({
  rule,
  options,
  open,
  onClose,
  onSaved,
}: RuleEditorDialogProps) {
  const [action, setAction] = useState(rule.action || options.actions[0]);
  const [generatedEventId, setGeneratedEventId] = useState(rule.generatedEventId ?? NONE);
  const [delayDays, setDelayDays] = useState(String(rule.delayDays));
  const [priority, setPriority] = useState(rule.priority);
  const [escalationRole, setEscalationRole] = useState(rule.escalationRole ?? NONE);
  const [notificationRole, setNotificationRole] = useState(rule.notificationRole ?? NONE);
  const [assignedRole, setAssignedRole] = useState(rule.assignedRole ?? NONE);
  const [isActive, setIsActive] = useState(rule.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Shared dialog behaviour: Escape close, focus trap, focus restore (M35C).
  const dialogRef = useDialogA11y(open, () => !saving && onClose());

  if (!open) return null;

  const caps = ACTION_CAPS[action] ?? DEFAULT_CAPS;
  const retry = rule.retryConfig;

  async function handleSave() {
    if (saving) return;
    setError('');
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }

    // Send ONLY the fields the selected action actually exposes; anything the
    // action hides is omitted and preserved server-side (never resubmitted).
    // retryPolicy is never sent — it is a read-only hint sourced from retry_config.
    const payload: UpdateRulePayload = { action, isActive };
    if (caps.delay) {
      const days = Number(delayDays);
      if (!Number.isFinite(days) || days < 0) {
        setError('Delay must be a non-negative number of days.');
        return;
      }
      payload.delayDays = Math.round(days);
    }
    if (caps.priority) {
      payload.priority = priority;
    }
    if (caps.nextActivity && generatedEventId) {
      payload.generatedEventId = generatedEventId;
    }
    if (caps.escalationRole) {
      payload.escalationRole = escalationRole || null;
    }
    if (caps.notificationRole) {
      payload.notificationRole = notificationRole || null;
    }
    if (caps.assignedRole) {
      payload.assignedRole = assignedRole || null;
    }

    setSaving(true);
    try {
      const updated = await updateWorkflowRule(token, rule.id, payload);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the rule.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="modal"
        ref={dialogRef} role="dialog"
        aria-modal="true"
        aria-labelledby="rule-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="rule-editor-title" className="modal-title">Edit Workflow Rule</h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}

          <div className="fg">
            <label className="fl">Outcome</label>
            <div className="dq-fixed-patient">
              <span>{rule.outcome}</span>
              <span className={`pill wf-cat-${rule.category.toLowerCase()}`}>{rule.category}</span>
              {rule.forEvent && <span className="wf-for-event">on {rule.forEvent}</span>}
            </div>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="re-action">Workflow Action *</label>
            <select id="re-action" className="fc" value={action} disabled={saving}
              onChange={(e) => setAction(e.target.value)}>
              {options.actions.map((a) => (
                <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {caps.nextActivity && (
            <div className="fg">
              <label className="fl" htmlFor="re-event">Next Activity</label>
              <select id="re-event" className="fc" value={generatedEventId} disabled={saving}
                onChange={(e) => setGeneratedEventId(e.target.value)}>
                <option value={NONE}>— None —</option>
                {options.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>
          )}

          {(caps.delay || caps.priority) && (
            <div className="modal-row">
              {caps.delay && (
                <div className="fg">
                  <label className="fl" htmlFor="re-delay">Delay (days)</label>
                  <input id="re-delay" type="number" min={0} max={365} className="fc"
                    value={delayDays} disabled={saving}
                    onChange={(e) => setDelayDays(e.target.value)} />
                </div>
              )}
              {caps.priority && (
                <div className="fg">
                  <label className="fl" htmlFor="re-priority">Priority</label>
                  <select id="re-priority" className="fc" value={priority} disabled={saving}
                    onChange={(e) => setPriority(e.target.value)}>
                    {options.priorities.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {caps.delay && (
            <div className="dq-dialog-note">
              Delay applies only when this action creates or schedules a new activity —
              it sets how many days ahead the new activity is due.
            </div>
          )}

          {caps.retryInfo && (
            <>
              <div className="dq-dialog-note">
                Retry timing is governed by the <strong>Retry Policy</strong> configured for this
                program &amp; disease — not by a per-rule delay. The values below are read-only and
                come from <code>retry_config</code>.
              </div>
              {retry ? (
                <>
                  <div className="fg">
                    <label className="fl">Retry Policy</label>
                    <div className="dq-fixed-patient">
                      <span>{rule.retryPolicy || 'STANDARD'}</span>
                      {(retry.program || retry.disease) && (
                        <span className="wf-for-event">
                          {[retry.program, retry.disease].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="modal-row">
                    <div className="fg">
                      <label className="fl">Effective Retry Interval</label>
                      <div className="dq-fixed-patient">Every {retry.retryIntervalHours} hours</div>
                    </div>
                    <div className="fg">
                      <label className="fl">Maximum Attempts</label>
                      <div className="dq-fixed-patient">{retry.maxAttempts}</div>
                    </div>
                  </div>
                  <div className="modal-row">
                    <div className="fg">
                      <label className="fl">Escalation After</label>
                      <div className="dq-fixed-patient">{retry.escalationAfterAttempts} attempts</div>
                    </div>
                    <div className="fg">
                      <label className="fl">Escalation Role</label>
                      <div className="dq-fixed-patient">{retry.escalationRole || '—'}</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="fg">
                  <label className="fl">Retry Policy</label>
                  <div className="dq-fixed-patient">
                    No retry policy is configured for this program &amp; disease; the engine
                    default applies.
                  </div>
                </div>
              )}
            </>
          )}

          {(caps.escalationRole || caps.notificationRole) && (
            <div className="modal-row">
              {caps.escalationRole && (
                <div className="fg">
                  <label className="fl" htmlFor="re-esc">Escalation Role</label>
                  <select id="re-esc" className="fc" value={escalationRole} disabled={saving}
                    onChange={(e) => setEscalationRole(e.target.value)}>
                    <option value={NONE}>— None —</option>
                    {options.roles.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}
              {caps.notificationRole && (
                <div className="fg">
                  <label className="fl" htmlFor="re-notify">Notification Role</label>
                  <select id="re-notify" className="fc" value={notificationRole} disabled={saving}
                    onChange={(e) => setNotificationRole(e.target.value)}>
                    <option value={NONE}>— None —</option>
                    {options.roles.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {caps.assignedRole && (
            <div className="fg">
              <label className="fl" htmlFor="re-assign">Assign To Role</label>
              <select id="re-assign" className="fc" value={assignedRole} disabled={saving}
                onChange={(e) => setAssignedRole(e.target.value)}>
                <option value={NONE}>— Worker&apos;s own role —</option>
                {options.roles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <div className="dq-dialog-note">
                Activities this rule creates are assigned to the patient&apos;s registered care
                worker. This sets the responsible <em>role</em> stamped on them; leave unset to
                use the worker&apos;s own role.
              </div>
            </div>
          )}

          {action === 'ESCALATE' && (
            <div className="dq-dialog-note">
              Escalation immediately marks the activity as <strong>EMERGENCY</strong> and notifies
              the configured role.
            </div>
          )}

          <div className="fg">
            <label className="fl" htmlFor="re-active">Active</label>
            <label className="wf-toggle">
              <input id="re-active" type="checkbox" checked={isActive} disabled={saving}
                onChange={(e) => setIsActive(e.target.checked)} />
              <span>{isActive ? 'Rule is active' : 'Rule is inactive'}</span>
            </label>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
