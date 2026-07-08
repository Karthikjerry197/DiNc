'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Inbox, Phone, Plus } from 'lucide-react';
import type { ActivityEntry } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { SkeletonLines } from '@/components/shell/Skeleton';

interface ActivityWorkspaceProps {
  /** Every scheduled activity for the selected citizen, across all programmes. */
  entries: ActivityEntry[];
  loading: boolean;
  error: string;
  /** Whether an enrollment is selected — gates the "New Activity" action. */
  hasEnrollment: boolean;
  onNewActivity: () => void;
  /** Opens the consultation workspace for a worklist activity. */
  onStartCall?: (activityId: string) => void;
}

const DAY_MS = 86_400_000;

interface Derived {
  done: boolean;
  overdue: boolean;
  /** Whole days past the due date, when overdue. */
  breachedDays: number;
}

function derive(entry: ActivityEntry): Derived {
  const done = ['COMPLETED', 'DONE', 'CLOSED'].includes(entry.status.toUpperCase());
  if (done || !entry.dueDate) return { done, overdue: false, breachedDays: 0 };
  const due = new Date(entry.dueDate).getTime();
  const today = Date.now();
  const overdue = due < today;
  return { done, overdue, breachedDays: overdue ? Math.floor((today - due) / DAY_MS) : 0 };
}

/**
 * Right panel: the citizen's full activity worklist (every programme). Rows are
 * data-driven — programme, activity, due date, status and priority all come from
 * the backend; the overdue / breached-days indicators are derived from the due
 * date. Only this panel scrolls. No disease-specific logic.
 */
export default function ActivityWorkspace({
  entries,
  loading,
  error,
  hasEnrollment,
  onNewActivity,
  onStartCall,
}: ActivityWorkspaceProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => {
    let done = 0;
    let overdue = 0;
    let pending = 0;
    for (const e of entries) {
      const d = derive(e);
      if (d.done) done += 1;
      else if (d.overdue) overdue += 1;
      else pending += 1;
    }
    return { done, overdue, pending };
  }, [entries]);

  return (
    <aside className="cz-timeline czx-acts">
      <div className="czx-acts-head">
        <div className="czx-acts-title">
          <h2 className="cz-panel-title">Activities</h2>
          <span className="cz-count">{entries.length}</span>
        </div>
        <div className="czx-acts-summary">
          <span className="czx-sum czx-sum-done">{counts.done} done</span>
          <span className="czx-sum czx-sum-over">{counts.overdue} overdue</span>
          <span className="czx-sum czx-sum-pend">{counts.pending} pending</span>
          <button
            type="button"
            className="act-new-btn"
            title={hasEnrollment ? 'New activity' : 'Select a programme first'}
            onClick={onNewActivity}
            disabled={!hasEnrollment}
          >
            <Plus size={13} aria-hidden="true" /> New
          </button>
        </div>
      </div>

      <div className="czx-acts-list">
        {loading ? (
          <SkeletonLines lines={6} />
        ) : error ? (
          <div className="dash-error">{error}</div>
        ) : entries.length === 0 ? (
          <EmptyState text="No scheduled activities for this citizen." />
        ) : (
          entries.map((entry) => {
            const d = derive(entry);
            const open = entry.id === openId;
            const stateClass = d.done ? 'is-done' : d.overdue ? 'is-overdue' : 'is-pending';
            return (
              <article key={entry.id} className={`czx-act-row ${stateClass}${open ? ' open' : ''}`}>
                <span className="czx-act-dot" aria-hidden="true" />
                <div className="czx-act-main">
                  <div className="czx-act-title">
                    {entry.program && <span className="czx-act-prog">{entry.program}</span>}
                    {entry.program && <span className="czx-act-sep"> · </span>}
                    <span className="czx-act-name">{entry.activity ?? 'Activity'}</span>
                  </div>
                  <div className="czx-act-sub">
                    Due: <span className="czx-act-due">{formatDate(entry.dueDate)}</span>
                    {d.breachedDays > 0 && (
                      <span className="czx-breach">Breached {d.breachedDays}d</span>
                    )}
                  </div>

                  {open && (
                    <dl className="czx-act-detail">
                      <div><dt>Programme</dt><dd>{entry.program ?? '—'}</dd></div>
                      <div><dt>Status</dt><dd>{entry.status}</dd></div>
                      <div><dt>Priority</dt><dd>{entry.priority}</dd></div>
                      <div><dt>Due</dt><dd>{formatDate(entry.dueDate)}</dd></div>
                    </dl>
                  )}
                </div>

                <div className="czx-act-actions">
                  <span className={`czx-status ${stateClass}`}>
                    {d.overdue ? 'Overdue' : d.done ? 'Done' : 'Pending'}
                  </span>
                  <span className={`pill pill-${entry.priority.toLowerCase()}`}>{entry.priority}</span>
                  {onStartCall && (
                    <button
                      type="button"
                      className="czx-act-call"
                      title="Start Call"
                      onClick={() => onStartCall(entry.id)}
                    >
                      <Phone size={13} aria-hidden="true" /> Call
                    </button>
                  )}
                  <button
                    type="button"
                    className="czx-act-icon"
                    title={open ? 'Hide details' : 'View details'}
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : entry.id)}
                  >
                    <BookOpen size={13} aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </aside>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
      <div className="empty-state-text">{text}</div>
    </div>
  );
}
