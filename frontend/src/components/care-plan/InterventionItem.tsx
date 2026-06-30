'use client';

import { useState } from 'react';
import type { CarePlanIntervention, InterventionStatus } from '@/lib/api';

const STATUS_LABELS: Record<InterventionStatus, string> = {
  PLANNED:      'Planned',
  ONGOING:      'Ongoing',
  COMPLETED:    'Completed',
  DISCONTINUED: 'Discontinued',
};

interface Props {
  intervention: CarePlanIntervention;
  onStatusChange?: (interventionId: string, status: InterventionStatus) => void;
  onDelete?: (interventionId: string) => void;
  readOnly?: boolean;
}

export default function InterventionItem({ intervention: iv, onStatusChange, onDelete, readOnly }: Props) {
  const [expanded, setExpanded] = useState(false);

  const hasOwnership = iv.assignedTo || iv.assignedBy || iv.dueDate;
  const hasCompletion = iv.completedBy || iv.completedDate;

  return (
    <div className={`cp-intervention cp-intervention--${iv.status.toLowerCase()}`}>
      <div className="cp-intervention-row">
        <span className={`cp-intervention-status cp-intervention-status--${iv.status.toLowerCase()}`}>
          {STATUS_LABELS[iv.status]}
        </span>
        <span className="cp-intervention-title">{iv.title}</span>

        {!readOnly && onStatusChange && (
          <select
            className="cp-intervention-status-sel"
            value={iv.status}
            onChange={(e) => onStatusChange(iv.id, e.target.value as InterventionStatus)}
            aria-label="Change intervention status"
          >
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        )}

        {(hasOwnership || iv.description || iv.frequency) && (
          <button
            type="button"
            className="cp-intervention-toggle"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        )}

        {!readOnly && onDelete && (
          <button
            type="button"
            className="cp-intervention-del"
            onClick={() => onDelete(iv.id)}
            aria-label="Remove intervention"
          >
            ×
          </button>
        )}
      </div>

      {expanded && (
        <div className="cp-intervention-detail">
          {iv.description && <p className="cp-intervention-desc">{iv.description}</p>}

          <div className="cp-intervention-meta">
            {iv.frequency && (
              <span className="cp-meta-chip">Frequency: {iv.frequency}</span>
            )}
            {iv.responsible && (
              <span className="cp-meta-chip">Role: {iv.responsible}</span>
            )}
          </div>

          {hasOwnership && (
            <div className="cp-ownership-grid">
              {iv.assignedBy && (
                <div className="cp-ownership-row">
                  <span className="cp-ownership-label">Assigned by</span>
                  <span className="cp-ownership-value">{iv.assignedBy}</span>
                </div>
              )}
              {iv.assignedTo && (
                <div className="cp-ownership-row">
                  <span className="cp-ownership-label">Assigned to</span>
                  <span className="cp-ownership-value">{iv.assignedTo}</span>
                </div>
              )}
              {iv.dueDate && (
                <div className="cp-ownership-row">
                  <span className="cp-ownership-label">Due date</span>
                  <span className="cp-ownership-value">
                    {new Date(iv.dueDate).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </span>
                </div>
              )}
            </div>
          )}

          {hasCompletion && (
            <div className="cp-ownership-grid">
              {iv.completedBy && (
                <div className="cp-ownership-row">
                  <span className="cp-ownership-label">Completed by</span>
                  <span className="cp-ownership-value">{iv.completedBy}</span>
                </div>
              )}
              {iv.completedDate && (
                <div className="cp-ownership-row">
                  <span className="cp-ownership-label">Completed on</span>
                  <span className="cp-ownership-value">
                    {new Date(iv.completedDate).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
