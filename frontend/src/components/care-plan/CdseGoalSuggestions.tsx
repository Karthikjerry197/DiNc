'use client';

import { useState } from 'react';
import type { CdseDecisionEntry, CdseGoalSuggestion, GoalPriority } from '@/lib/api';
import { Check, X } from 'lucide-react';

const PRIORITY_LABELS: Record<GoalPriority, string> = {
  CRITICAL: 'Critical',
  HIGH:     'High',
  ROUTINE:  'Routine',
};

interface DecisionState {
  decision: 'ACCEPTED' | 'DECLINED' | null;
  declineReason: string;
}

interface Props {
  suggestions: CdseGoalSuggestion[];
  onSubmit: (decisions: CdseDecisionEntry[]) => void;
  onClose: () => void;
  saving?: boolean;
}

export default function CdseGoalSuggestions({ suggestions, onSubmit, onClose, saving }: Props) {
  const [states, setStates] = useState<Record<string, DecisionState>>(() => {
    const initial: Record<string, DecisionState> = {};
    for (const s of suggestions) {
      initial[s.cdseRuleId] = { decision: null, declineReason: '' };
    }
    return initial;
  });

  function setDecision(ruleId: string, decision: 'ACCEPTED' | 'DECLINED' | null) {
    setStates((prev) => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], decision },
    }));
  }

  function setReason(ruleId: string, declineReason: string) {
    setStates((prev) => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], declineReason },
    }));
  }

  function handleSubmit() {
    const decisions: CdseDecisionEntry[] = [];
    for (const s of suggestions) {
      const st = states[s.cdseRuleId];
      if (!st?.decision) continue;
      decisions.push({
        cdseRuleId: s.cdseRuleId,
        recommendationTitle: s.title,
        decision: st.decision,
        declineReason: st.decision === 'DECLINED' ? st.declineReason || undefined : undefined,
      });
    }
    onSubmit(decisions);
  }

  const decidedCount = Object.values(states).filter((s) => s.decision !== null).length;
  const actionable = suggestions.filter((s) => !s.alreadyAccepted);

  return (
    <div className="cp-cdse-suggestions">
      <div className="cp-cdse-suggestions-head">
        <span className="cp-cdse-suggestions-title">CDSE Goal Suggestions</span>
        <span className="cp-cdse-suggestions-sub">
          Accept recommendations to add them as care plan goals
        </span>
      </div>

      {actionable.length === 0 && (
        <div className="cp-cdse-empty">
          All current CDSE recommendations have already been added to this care plan.
        </div>
      )}

      <div className="cp-cdse-list">
        {suggestions.map((s) => {
          const st = states[s.cdseRuleId];
          const isAlready = s.alreadyAccepted;

          return (
            <div
              key={s.cdseRuleId}
              className={`cp-cdse-card ${isAlready ? 'cp-cdse-card--accepted' : ''} ${st?.decision ? `cp-cdse-card--${st.decision.toLowerCase()}` : ''}`}
            >
              <div className="cp-cdse-card-head">
                <span className={`cp-goal-priority cp-goal-priority--${s.priority.toLowerCase()}`}>
                  {PRIORITY_LABELS[s.priority]}
                </span>
                <span className="cp-cdse-card-title">{s.title}</span>
                {isAlready && (
                  <span className="cp-cdse-already-badge">Already on plan</span>
                )}
              </div>

              <p className="cp-cdse-card-desc">{s.description}</p>

              {s.targetValue && (
                <span className="cp-target-chip" style={{ marginBottom: 8 }}>
                  <span className="cp-target-label">Target</span>
                  {s.targetValue}
                </span>
              )}

              {s.lastDecision && !isAlready && (
                <div className={`cp-cdse-last-decision cp-cdse-last-decision--${s.lastDecision.toLowerCase()}`}>
                  Previously {s.lastDecision.toLowerCase()}
                  {s.lastDeclineReason && `: "${s.lastDeclineReason}"`}
                </div>
              )}

              {!isAlready && (
                <div className="cp-cdse-actions">
                  <button
                    type="button"
                    className={`cp-cdse-btn cp-cdse-btn--accept ${st?.decision === 'ACCEPTED' ? 'cp-cdse-btn--active' : ''}`}
                    onClick={() => setDecision(s.cdseRuleId, st?.decision === 'ACCEPTED' ? null : 'ACCEPTED')}
                    disabled={saving}
                  >
                    <Check size={13} aria-hidden="true" /> Accept
                  </button>
                  <button
                    type="button"
                    className={`cp-cdse-btn cp-cdse-btn--decline ${st?.decision === 'DECLINED' ? 'cp-cdse-btn--active' : ''}`}
                    onClick={() => setDecision(s.cdseRuleId, st?.decision === 'DECLINED' ? null : 'DECLINED')}
                    disabled={saving}
                  >
                    <X size={13} aria-hidden="true" /> Decline
                  </button>
                </div>
              )}

              {!isAlready && st?.decision === 'DECLINED' && (
                <textarea
                  className="cp-cdse-reason fc"
                  rows={2}
                  placeholder="Reason for declining (optional)"
                  value={st.declineReason}
                  onChange={(e) => setReason(s.cdseRuleId, e.target.value)}
                  maxLength={500}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="cp-cdse-footer">
        <button
          type="button"
          className="btn-outline"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleSubmit}
          disabled={saving || decidedCount === 0}
        >
          {saving ? 'Saving…' : `Save ${decidedCount} decision${decidedCount !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
