'use client';

import { useState } from 'react';
import type { CarePlanGoal, GoalPriority, GoalStatus, InterventionStatus } from '@/lib/api';
import InterventionItem from './InterventionItem';

const PRIORITY_LABELS: Record<GoalPriority, string> = {
  CRITICAL: 'Critical',
  HIGH:     'High',
  ROUTINE:  'Routine',
};

const STATUS_LABELS: Record<GoalStatus, string> = {
  ACTIVE:       'Active',
  ACHIEVED:     'Achieved',
  PARTIAL:      'Partial',
  NOT_ACHIEVED: 'Not Achieved',
  DEFERRED:     'Deferred',
};

const CATEGORY_ICONS: Record<string, string> = {
  CLINICAL:   '🩺',
  LIFESTYLE:  '🏃',
  MEDICATION: '💊',
  EDUCATION:  '📋',
  REFERRAL:   '↗',
};

interface Props {
  goal: CarePlanGoal;
  onStatusChange?: (goalId: string, status: GoalStatus) => void;
  onInterventionStatusChange?: (interventionId: string, status: InterventionStatus) => void;
  onDeleteGoal?: (goalId: string) => void;
  onDeleteIntervention?: (interventionId: string) => void;
  readOnly?: boolean;
  defaultExpanded?: boolean;
}

export default function GoalCard({
  goal,
  onStatusChange,
  onInterventionStatusChange,
  onDeleteGoal,
  onDeleteIntervention,
  readOnly,
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const activeInterventions = goal.interventions.filter(
    (iv) => iv.status === 'PLANNED' || iv.status === 'ONGOING',
  );

  return (
    <div className={`cp-goal cp-goal--${goal.status.toLowerCase()} cp-goal--${goal.priority.toLowerCase()}`}>
      {/* ── Goal header ── */}
      <button
        type="button"
        className="cp-goal-header"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="cp-goal-header-left">
          <span className={`cp-goal-priority cp-goal-priority--${goal.priority.toLowerCase()}`}>
            {PRIORITY_LABELS[goal.priority]}
          </span>
          <span className="cp-goal-category-icon" aria-hidden="true">
            {CATEGORY_ICONS[goal.category] ?? '◉'}
          </span>
          <span className="cp-goal-title">{goal.title}</span>
          {goal.cdseRuleId && (
            <span className="cp-goal-cdse-badge" title="Suggested by Clinical Decision Support">CDSE</span>
          )}
        </div>

        <div className="cp-goal-header-right">
          <span className={`cp-goal-status cp-goal-status--${goal.status.toLowerCase()}`}>
            {STATUS_LABELS[goal.status]}
          </span>
          {!readOnly && onStatusChange && (
            <select
              className="cp-goal-status-sel"
              value={goal.status}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                onStatusChange(goal.id, e.target.value as GoalStatus);
              }}
              aria-label="Update goal status"
            >
              {Object.entries(STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          )}
          {!readOnly && onDeleteGoal && (
            <button
              type="button"
              className="cp-goal-del"
              onClick={(e) => { e.stopPropagation(); onDeleteGoal(goal.id); }}
              aria-label="Remove goal"
            >
              ×
            </button>
          )}
          <span className="cp-goal-toggle" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {/* ── Goal body ── */}
      {expanded && (
        <div className="cp-goal-body">
          {(goal.description || goal.targetValue || goal.targetDate) && (
            <div className="cp-goal-meta">
              {goal.description && (
                <p className="cp-goal-desc">{goal.description}</p>
              )}
              <div className="cp-goal-targets">
                {goal.targetValue && (
                  <span className="cp-target-chip">
                    <span className="cp-target-label">Target</span>
                    {goal.targetValue}
                  </span>
                )}
                {goal.targetDate && (
                  <span className="cp-target-chip">
                    <span className="cp-target-label">By</span>
                    {new Date(goal.targetDate).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Interventions ── */}
          {goal.interventions.length > 0 && (
            <div className="cp-interventions-section">
              <div className="cp-interventions-label">
                Interventions
                {activeInterventions.length > 0 && (
                  <span className="cp-interventions-count">
                    {activeInterventions.length} active
                  </span>
                )}
              </div>
              <div className="cp-interventions-list">
                {goal.interventions.map((iv) => (
                  <InterventionItem
                    key={iv.id}
                    intervention={iv}
                    onStatusChange={onInterventionStatusChange}
                    onDelete={onDeleteIntervention}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </div>
          )}

          {goal.interventions.length === 0 && !readOnly && (
            <p className="cp-interventions-empty">No interventions added yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
