'use client';

import { memo, useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleCheck, ClipboardCheck, Inbox, ListChecks } from 'lucide-react';
import { fetchCitizenTimeline, type TimelineEntry } from '@/lib/api';
import { getToken } from '@/lib/session';
import { formatDate } from '@/lib/format';
import Panel from '@/components/workspace/Panel';
import PanelHeader from '@/components/workspace/PanelHeader';
import PanelContent from '@/components/workspace/PanelContent';
import { SkeletonLines } from '@/components/shell/Skeleton';

interface PatientTimelineProps {
  citizenId: string | null;
  /** Bump to force a refetch (e.g. after a consultation is saved). */
  refreshKey?: number;
}

/**
 * Patient Timeline — the longitudinal care history for a citizen. Renders every
 * enrollment and activity chronologically. Completed consultations remain
 * permanently visible; nothing is overwritten (history is append-only).
 *
 * Memoized: props are primitives, so the timeline skips re-renders caused by
 * unrelated page state (toasts, panel loading flags).
 */
function PatientTimeline({ citizenId, refreshKey = 0 }: PatientTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!citizenId) {
      setEntries([]);
      return;
    }
    const token = getToken();
    if (!token) return;
    let active = true;
    setLoading(true);
    setError('');
    fetchCitizenTimeline(token, citizenId)
      .then((list) => {
        if (active) {
          setEntries(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to load patient timeline.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [citizenId, refreshKey]);

  return (
    <Panel variant="subtle" aria-label="Patient Timeline">
      <PanelHeader
        title="Patient Timeline"
        actions={entries.length > 0 ? <span className="cz-count">{entries.length}</span> : undefined}
      />

      <PanelContent>
        {loading ? (
          <SkeletonLines lines={3} />
        ) : error ? (
          <div className="dash-error">{error}</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
            <div className="empty-state-text">No timeline events yet.</div>
          </div>
        ) : (
          <ol className="pt-timeline">
            {entries.map((entry) => (
              <li key={`${entry.kind}-${entry.id}`} className={`pt-item pt-${entry.kind.toLowerCase()}`}>
                <span className="pt-marker" aria-hidden="true">
                  {entry.kind === 'ENROLLMENT'
                    ? <ClipboardCheck size={14} />
                    : entry.kind === 'COMPLETION'
                      ? <CircleCheck size={14} />
                      : <ListChecks size={14} />}
                </span>
                <div className="pt-body">
                  <div className="pt-title-row">
                    <span className="pt-title">{entry.title}</span>
                    <span className={`pill pill-${entry.status.toLowerCase()}`}>{entry.status}</span>
                  </div>
                  <div className="pt-meta">
                    <span className="pt-kind">
                      {entry.kind === 'ENROLLMENT'
                        ? 'Enrollment'
                        : entry.kind === 'COMPLETION'
                          ? 'Care plan completed'
                          : 'Activity'}
                    </span>
                    {entry.program && <span> · {entry.program}</span>}
                    <span> · {formatDate(entry.date)}</span>
                    {entry.outcome && <span className="pt-outcome"> · {entry.outcome.replace(/_/g, ' ')}</span>}
                  </div>
                </div>
                {/* Timeline → Consultation (M33.1): open activities continue directly. */}
                {entry.kind === 'ACTIVITY' &&
                  (entry.status === 'PENDING' || entry.status === 'IN_PROGRESS') && (
                    <Link
                      className="btn btn-ghost pt-consult-link"
                      href={`/worklist/${entry.id}/consult?returnUrl=${encodeURIComponent(`/citizens?c=${citizenId ?? ''}`)}`}
                      title="Open the consultation workspace for this activity"
                    >
                      Consult →
                    </Link>
                  )}
              </li>
            ))}
          </ol>
        )}
      </PanelContent>
    </Panel>
  );
}

export default memo(PatientTimeline);
