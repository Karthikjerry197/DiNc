'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Phone, Eye, Flag, Inbox } from 'lucide-react';
import { fetchWorklistItemGuidebook, type WorklistItem } from '@/lib/api';
import { getToken } from '@/lib/session';

interface Props {
  items: WorklistItem[];
  onFlash: (msg: string) => void;
  onConsult: (activityId: string) => void;
  onDuplicate: (citizenId: string, uhid: string, fullName: string) => void;
  /** Empty-state copy; group hosts (Care Dashboard) supply section-specific text. */
  emptyText?: string;
}

/**
 * Due-date display: the year is omitted while current (it's noise on a daily
 * list), and a date whose day has fully passed is flagged overdue so triage
 * doesn't have to do date math while scanning.
 */
function formatDue(iso: string | null): { label: string; overdue: boolean } {
  if (!iso) return { label: '—', overdue: false };
  const d = new Date(iso);
  const now = new Date();
  const label = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { label, overdue: end.getTime() < now.getTime() };
}

function val(text: string | null): string {
  return text?.trim() ? text : '—';
}

/**
 * The compact dashboard follow-up table (UHID-only identity) with per-row
 * Guidebook / Call / Open / Report actions. Extracted from WorklistWidget (M36)
 * so the Admin Dashboard's worklist and the Care Dashboard's task groups render
 * through the one implementation.
 */
export default function FollowupTable({
  items,
  onFlash,
  onConsult,
  onDuplicate,
  emptyText = 'No follow-up items to display.',
}: Props) {
  const router = useRouter();

  const openGuidebook = useCallback(
    async (itemId: string) => {
      const token = getToken();
      if (!token) { onFlash('Session expired.'); return; }
      try {
        const gb = await fetchWorklistItemGuidebook(token, itemId);
        if (gb) { router.push(`/guidebooks?g=${gb.id}&activity=${itemId}`); }
        else { onFlash('No specific guidebook is mapped to this activity.'); }
      } catch {
        onFlash('Unable to open the guidebook for this activity.');
      }
    },
    [router, onFlash],
  );

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
        <div className="empty-state-text">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="dash-worklist-wrap">
      <table className="data-table dash-worklist-table">
        <thead>
          <tr>
            {/* Scan order: who → what → when → how urgent → act. UHID is
              * the Dashboard's only identity (system-wide primary identifier;
              * patient names are intentionally not shown here). Status is
              * omitted — this list is filtered to PENDING, so the column
              * would repeat one value and carry no signal. */}
            <th>UHID</th>
            <th>Activity</th>
            <th>Program</th>
            <th className="dash-td-due">Due</th>
            <th>Priority</th>
            <th className="dash-col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const due = formatDue(item.dueDate);
            return (
            <tr key={item.id}>
              <td className="dash-td-uhid mono" title={val(item.uhid)}>{val(item.uhid)}</td>
              <td className="dash-td-activity" title={val(item.activity)}>{val(item.activity)}</td>
              <td className="dash-td-program" title={val(item.program)}>{val(item.program)}</td>
              <td className={`dash-td-due${due.overdue ? ' dash-td-due--overdue' : ''}`}>
                {due.label}
              </td>
              <td>
                <span className={`pill pill-${item.priority.toLowerCase()}`}>{item.priority}</span>
              </td>
              <td className="dash-col-actions">
                <div className="dash-row-actions">
                  <button type="button" className="wl-icon-btn wl-icon-btn--guide" title="Guidebook"
                    aria-label="Guidebook" onClick={() => openGuidebook(item.id)}>
                    <BookOpen size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="wl-icon-btn wl-icon-btn--call" title="Start teleconsultation"
                    aria-label="Call" onClick={() => onConsult(item.id)}>
                    <Phone size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="wl-icon-btn wl-icon-btn--open" title="Open patient workspace"
                    aria-label="Open Patient" disabled={!item.citizenId}
                    onClick={() => item.citizenId && router.push(`/citizens?c=${item.citizenId}`)}>
                    <Eye size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="wl-icon-btn wl-icon-btn--report" title="Report duplicate"
                    aria-label="Report Duplicate" disabled={!item.citizenId}
                    onClick={() => item.citizenId && onDuplicate(item.citizenId, item.uhid ?? '', item.citizen ?? '')}>
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
