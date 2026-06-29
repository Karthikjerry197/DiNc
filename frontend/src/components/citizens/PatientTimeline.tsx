'use client';

import { useEffect, useState } from 'react';
import { fetchCitizenTimeline, type TimelineEntry } from '@/lib/api';
import { getToken } from '@/lib/session';

interface PatientTimelineProps {
  citizenId: string | null;
  /** Bump to force a refetch (e.g. after a consultation is saved). */
  refreshKey?: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Patient Timeline — the longitudinal care history for a citizen. Renders every
 * enrollment and activity chronologically. Completed consultations remain
 * permanently visible; nothing is overwritten (history is append-only).
 */
export default function PatientTimeline({ citizenId, refreshKey = 0 }: PatientTimelineProps) {
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
    <div className="panel cz-timeline-panel">
      <div className="panel-head">
        <h2 className="panel-title">Patient Timeline</h2>
        {entries.length > 0 && <span className="cz-count">{entries.length}</span>}
      </div>

      {loading ? (
        <div className="dash-loading">Loading timeline&hellip;</div>
      ) : error ? (
        <div className="dash-error">{error}</div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">∅</div>
          <div className="empty-state-text">No timeline events yet.</div>
        </div>
      ) : (
        <ol className="pt-timeline">
          {entries.map((entry) => (
            <li key={`${entry.kind}-${entry.id}`} className={`pt-item pt-${entry.kind.toLowerCase()}`}>
              <span className="pt-marker" aria-hidden="true">
                {entry.kind === 'ENROLLMENT' ? '🏁' : '•'}
              </span>
              <div className="pt-body">
                <div className="pt-title-row">
                  <span className="pt-title">{entry.title}</span>
                  <span className={`pill pill-${entry.status.toLowerCase()}`}>{entry.status}</span>
                </div>
                <div className="pt-meta">
                  <span className="pt-kind">{entry.kind === 'ENROLLMENT' ? 'Enrollment' : 'Activity'}</span>
                  {entry.program && <span> · {entry.program}</span>}
                  <span> · {formatDate(entry.date)}</span>
                  {entry.outcome && <span className="pt-outcome"> · {entry.outcome.replace(/_/g, ' ')}</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
