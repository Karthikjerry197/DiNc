'use client';

import { useState } from 'react';
import {
  updateWorkflowRule,
  type WorkflowRule,
  type WorkflowRulesOverview,
} from '@/lib/api';
import { getToken } from '@/lib/session';

interface RuleEditorDialogProps {
  rule: WorkflowRule;
  options: WorkflowRulesOverview['options'];
  open: boolean;
  onClose: () => void;
  onSaved: (rule: WorkflowRule) => void;
}

const NONE = '';

/**
 * Rule Editor — lets administrators reconfigure what happens after an outcome
 * (action, next activity, delay, priority, retry policy, roles, active) WITHOUT
 * touching SQL. The outcome a rule fires for is its identity and is read-only.
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
  const [retryPolicy, setRetryPolicy] = useState(rule.retryPolicy ?? NONE);
  const [escalationRole, setEscalationRole] = useState(rule.escalationRole ?? NONE);
  const [notificationRole, setNotificationRole] = useState(rule.notificationRole ?? NONE);
  const [isActive, setIsActive] = useState(rule.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handleSave() {
    setError('');
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    const days = Number(delayDays);
    if (!Number.isFinite(days) || days < 0) {
      setError('Delay must be a non-negative number of days.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateWorkflowRule(token, rule.id, {
        action,
        generatedEventId: generatedEventId || undefined,
        delayDays: Math.round(days),
        priority,
        retryPolicy: retryPolicy || null,
        escalationRole: escalationRole || null,
        notificationRole: notificationRole || null,
        isActive,
      });
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
        role="dialog"
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

          <div className="modal-row">
            <div className="fg">
              <label className="fl" htmlFor="re-delay">Delay (days)</label>
              <input id="re-delay" type="number" min={0} max={365} className="fc"
                value={delayDays} disabled={saving}
                onChange={(e) => setDelayDays(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl" htmlFor="re-priority">Priority</label>
              <select id="re-priority" className="fc" value={priority} disabled={saving}
                onChange={(e) => setPriority(e.target.value)}>
                {options.priorities.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-row">
            <div className="fg">
              <label className="fl" htmlFor="re-retry">Retry Policy</label>
              <select id="re-retry" className="fc" value={retryPolicy} disabled={saving}
                onChange={(e) => setRetryPolicy(e.target.value)}>
                <option value={NONE}>— None —</option>
                {options.retryPolicies.map((rp) => (
                  <option key={rp} value={rp}>{rp}</option>
                ))}
              </select>
            </div>
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
          </div>

          <div className="modal-row">
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
            <div className="fg">
              <label className="fl" htmlFor="re-active">Active</label>
              <label className="wf-toggle">
                <input id="re-active" type="checkbox" checked={isActive} disabled={saving}
                  onChange={(e) => setIsActive(e.target.checked)} />
                <span>{isActive ? 'Rule is active' : 'Rule is inactive'}</span>
              </label>
            </div>
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
