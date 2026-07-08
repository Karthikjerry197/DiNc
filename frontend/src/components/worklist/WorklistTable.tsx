'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Bell, BookOpen, Eye, Flag, Inbox, Phone } from 'lucide-react';
import type { WorklistItem } from '@/lib/api';
import type { PatientIntelligence } from '@/lib/ai';
import { RiskScoreBadge, DefaultProbBadge } from '@/components/intelligence/badges';
import { displayValue as value, formatDate } from '@/lib/format';

interface WorklistTableProps {
  items: WorklistItem[];
  /** Opens the guidebook for a worklist item (context-aware navigation). */
  onOpenGuidebook: (itemId: string) => void;
  /** Opens the Report Duplicate dialog for a worklist item's citizen. */
  onReportDuplicate?: (item: WorklistItem) => void;
  /** Starts the consultation: opens the Consultation Workspace and initiates the call. */
  onStartCall?: (item: WorklistItem) => void;
  /** AI-assisted intelligence per citizen (spec §5.3). Enables the AI column + row emphasis. */
  intelById?: Map<string, PatientIntelligence>;
}

/** A row is emphasised when it is high AI risk, a severe alert, or an escalation. */
function isHot(item: WorklistItem, intel?: PatientIntelligence): boolean {
  if (intel && (intel.risk.level === 'Critical' || intel.risk.level === 'High')) return true;
  return item.riskLevel === 'SEVERE' || item.isEscalation;
}

/**
 * Worklist table. Every row action is live (M35A Wave 1 removed the selection
 * checkboxes, the duplicate History shortcut and the placeholder More menu —
 * they return only when bulk actions / a row menu actually exist).
 *
 * Memoized: rows re-render only when the (already memoized) items array or a
 * row callback actually changes — not on unrelated page state such as toasts.
 */
function WorklistTable({
  items,
  onOpenGuidebook,
  onReportDuplicate,
  onStartCall,
  intelById,
}: WorklistTableProps) {
  const showAi = !!intelById;
  if (items.length === 0) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
          <div className="empty-state-text">No worklist items to display.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="wl-table-wrap">
      <table className="data-table wl-table">
        <thead>
          <tr>
            <th>UHID</th>
            <th>Program</th>
            <th>Sub Program</th>
            <th>Activity / Event</th>
            <th>Type</th>
            <th>Due Date</th>
            <th>Reminder</th>
            <th>Priority</th>
            <th>Risk</th>
            {showAi && <th>AI Insight</th>}
            <th>Status</th>
            <th className="wl-col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const intel = item.citizenId ? intelById?.get(item.citizenId) : undefined;
            return (
            <tr key={item.id} className={isHot(item, intel) ? 'wl-row-hot' : undefined}>
              <td className="mono">{value(item.uhid)}</td>
              <td>{value(item.program)}</td>
              <td>{value(item.subProgram)}</td>
              <td>{value(item.activity)}</td>
              <td>{value(item.type)}</td>
              <td>{formatDate(item.dueDate)}</td>
              <td className="wl-reminder">
                <span title={`${item.reminders} reminder(s) sent`}>
                  <Bell size={12} aria-hidden="true" /> {item.reminders}
                </span>
              </td>
              <td>
                <span className={`pill pill-${item.priority.toLowerCase()}`}>{item.priority}</span>
              </td>
              <td>
                {item.isEscalation ? (
                  <span className="pill pill-overdue">Escalation</span>
                ) : (
                  <span className="pill pill-low">Routine</span>
                )}
              </td>
              {showAi && (
                <td>
                  {intel ? (
                    <div className="wl-ai-cell">
                      <RiskScoreBadge score={intel.risk.score} level={intel.risk.level} />
                      <DefaultProbBadge probability={intel.followup.probability} band={intel.followup.band} />
                    </div>
                  ) : (
                    <span className="wl-ai-empty">—</span>
                  )}
                </td>
              )}
              <td>
                <span className={`pill pill-${item.status.toLowerCase()}`}>{item.status}</span>
              </td>
              <td className="wl-col-actions">
                <div className="wl-row-actions">
                  <Link
                    href={item.citizenId ? `/citizens?c=${item.citizenId}` : '/citizens'}
                    className="wl-icon-btn"
                    title="Open Citizen Record"
                    aria-label="Open Citizen Record"
                  >
                    <Eye size={16} aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    className="wl-icon-btn"
                    title="Start Call"
                    aria-label="Start Call"
                    disabled={!onStartCall}
                    onClick={() => onStartCall?.(item)}
                  >
                    <Phone size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="wl-icon-btn"
                    title="Open the guidebook for this item"
                    aria-label="Guidebook"
                    onClick={() => onOpenGuidebook(item.id)}
                  >
                    <BookOpen size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="wl-icon-btn"
                    title="Report Duplicate"
                    aria-label="Report Duplicate"
                    disabled={!item.citizenId || !onReportDuplicate}
                    onClick={() => item.citizenId && onReportDuplicate?.(item)}
                  >
                    <Flag size={16} aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default memo(WorklistTable);
