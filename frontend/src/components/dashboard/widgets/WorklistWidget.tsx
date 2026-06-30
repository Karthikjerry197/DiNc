'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchWorklistItemGuidebook,
  type AdminDashboardSummary,
  type WorklistItem,
} from '@/lib/api';
import { getToken } from '@/lib/session';

interface Props {
  worklist: AdminDashboardSummary['worklist'] | undefined;
  items: WorklistItem[];
  onFlash: (msg: string) => void;
  onConsult: (activityId: string) => void;
  onDuplicate: (citizenId: string, uhid: string, fullName: string) => void;
}

function statValue(v: number | null): string {
  return v === null ? '—' : v.toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function val(text: string | null): string {
  return text?.trim() ? text : '—';
}

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Consultation stat strip + follow-up worklist table. */
export default function WorklistWidget({ worklist, items, onFlash, onConsult, onDuplicate }: Props) {
  const router = useRouter();

  const followups = useMemo(() => {
    const pending = items.filter((i) => i.status.toUpperCase() === 'PENDING');
    const cutoff = endOfToday();
    const due = pending.filter((i) => i.dueDate && new Date(i.dueDate).getTime() <= cutoff);
    return (due.length > 0 ? due : pending).slice(0, 12);
  }, [items]);

  const openGuidebook = useCallback(
    async (itemId: string) => {
      const token = getToken();
      if (!token) { onFlash('Session expired.'); return; }
      try {
        const gb = await fetchWorklistItemGuidebook(token, itemId);
        if (gb) { router.push(`/guidebooks?g=${gb.id}`); }
        else { onFlash('No specific guidebook is mapped to this activity.'); }
      } catch {
        onFlash('Unable to open the guidebook for this activity.');
      }
    },
    [router, onFlash],
  );

  const stats = [
    { label: 'Completed Today', value: worklist?.completedToday  ?? null, accent: '#15803d' },
    { label: 'Pending',         value: worklist?.pending         ?? null, accent: '#d97706' },
    { label: 'Overdue',         value: worklist?.overdue         ?? null, accent: '#dc2626' },
    { label: 'Referred',        value: worklist?.referred        ?? null, accent: '#1d4ed8' },
    { label: 'No Answer',       value: worklist?.noAnswer        ?? null, accent: '#6b7280' },
    { label: 'Emergency',       value: worklist?.emergencyReferrals ?? null, accent: '#b91c1c' },
  ];

  return (
    <>
      <div className="consult-stat-row">
        {stats.map((s) => (
          <div key={s.label} className="consult-stat">
            <span className="consult-stat-value" style={{ color: s.accent }}>{statValue(s.value)}</span>
            <span className="consult-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {followups.length > 0 ? (
        <div className="dash-worklist-wrap">
          <table className="data-table dash-worklist-table">
            <thead>
              <tr>
                <th>UHID</th>
                <th>Program</th>
                <th>Activity</th>
                <th>Due Date</th>
                <th>Priority</th>
                <th>Status</th>
                <th className="dash-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {followups.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{val(item.uhid)}</td>
                  <td>{val(item.program)}</td>
                  <td>{val(item.activity)}</td>
                  <td>{formatDate(item.dueDate)}</td>
                  <td>
                    <span className={`pill pill-${item.priority.toLowerCase()}`}>{item.priority}</span>
                  </td>
                  <td>
                    <span className={`pill pill-${item.status.toLowerCase()}`}>{item.status}</span>
                  </td>
                  <td className="dash-col-actions">
                    <div className="dash-row-actions">
                      <button type="button" className="wl-icon-btn" title="Guidebook"
                        aria-label="Guidebook" onClick={() => openGuidebook(item.id)}>📖</button>
                      <button type="button" className="wl-icon-btn" title="Start teleconsultation"
                        aria-label="Call" onClick={() => onConsult(item.id)}>📞</button>
                      <button type="button" className="wl-icon-btn" title="Open patient workspace"
                        aria-label="Open Patient" disabled={!item.citizenId}
                        onClick={() => item.citizenId && router.push(`/citizens?c=${item.citizenId}`)}>👁</button>
                      <button type="button" className="wl-icon-btn" title="Report duplicate"
                        aria-label="Report Duplicate" disabled={!item.citizenId}
                        onClick={() => item.citizenId && onDuplicate(item.citizenId, item.uhid ?? '', item.citizen ?? '')}>⚠</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">∅</div>
          <div className="empty-state-text">No follow-up items to display.</div>
        </div>
      )}
    </>
  );
}
