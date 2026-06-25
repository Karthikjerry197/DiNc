'use client';

import Link from 'next/link';
import type { WorklistItem } from '@/lib/api';

interface WorklistTableProps {
  items: WorklistItem[];
}

/** Row action icons — UI only for this milestone (tooltips + hover, no behaviour). */
const ROW_ACTIONS: { key: string; icon: string; label: string }[] = [
  { key: 'open', icon: '↗', label: 'Open' },
  { key: 'history', icon: '🕘', label: 'History' },
  { key: 'guidebook', icon: '📘', label: 'Guidebook' },
  { key: 'call', icon: '📞', label: 'Call' },
  { key: 'duplicate', icon: '⧉', label: 'Duplicate' },
  { key: 'more', icon: '⋯', label: 'More' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function value(text: string | null): string {
  return text && text.trim() ? text : '—';
}

export default function WorklistTable({ items }: WorklistTableProps) {
  if (items.length === 0) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">∅</div>
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
            <th className="wl-col-check">
              <input type="checkbox" aria-label="Select all" />
            </th>
            <th>UHID</th>
            <th>Program</th>
            <th>Sub Program</th>
            <th>Activity / Event</th>
            <th>Type</th>
            <th>Due Date</th>
            <th>Reminder</th>
            <th>Priority</th>
            <th>Risk</th>
            <th>Status</th>
            <th className="wl-col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="wl-col-check">
                <input type="checkbox" aria-label={`Select ${item.uhid ?? item.id}`} />
              </td>
              <td className="mono">{value(item.uhid)}</td>
              <td>{value(item.program)}</td>
              <td>{value(item.subProgram)}</td>
              <td>{value(item.activity)}</td>
              <td>{value(item.type)}</td>
              <td>{formatDate(item.dueDate)}</td>
              <td className="wl-reminder">
                <span title={`${item.reminders} reminder(s) sent`}>🔔 {item.reminders}</span>
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
              <td>
                <span className={`pill pill-${item.status.toLowerCase()}`}>{item.status}</span>
              </td>
              <td className="wl-col-actions">
                <div className="wl-row-actions">
                  {ROW_ACTIONS.map((action) =>
                    action.key === 'open' ? (
                      // Open navigates into the Citizen Workspace (Milestone 4).
                      <Link
                        key={action.key}
                        href="/citizens"
                        className="wl-icon-btn"
                        title={action.label}
                        aria-label={action.label}
                      >
                        {action.icon}
                      </Link>
                    ) : (
                      <button
                        key={action.key}
                        type="button"
                        className="wl-icon-btn"
                        title={action.label}
                        aria-label={action.label}
                      >
                        {action.icon}
                      </button>
                    ),
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
