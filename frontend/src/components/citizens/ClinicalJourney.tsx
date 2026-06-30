'use client';

import { useEffect, useState } from 'react';
import { fetchClinicalJourney, type ClinicalJourneyEntry } from '@/lib/api';
import { getToken } from '@/lib/session';

type FilterKey = 'all' | 'consultations' | 'calls' | 'referrals' | 'outcomes';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'consultations', label: 'Consultations' },
  { key: 'calls', label: 'Calls' },
  { key: 'referrals', label: 'Referrals' },
  { key: 'outcomes', label: 'Outcomes' },
];

function applyFilter(entries: ClinicalJourneyEntry[], f: FilterKey): ClinicalJourneyEntry[] {
  switch (f) {
    case 'consultations': return entries.filter((e) => e.eventType === 'CONSULTATION');
    case 'calls':         return entries.filter((e) => (e.callCount ?? 0) > 0);
    case 'referrals':     return entries.filter((e) => e.outcomeCategory === 'ESCALATION');
    case 'outcomes':      return entries.filter((e) => e.outcomeName != null);
    default:              return entries;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function eventIcon(e: ClinicalJourneyEntry): string {
  if (e.eventType === 'ENROLLMENT') return '🏁';
  if (e.eventType === 'CONSULTATION') return '📋';
  return '⏳';
}

function eventLabel(e: ClinicalJourneyEntry): string {
  if (e.eventType === 'ENROLLMENT') return 'Enrollment';
  if (e.eventType === 'CONSULTATION') return 'Consultation';
  return 'Activity';
}

function catClass(cat: string | null | undefined): string {
  if (!cat) return '';
  return `wf-cat-${cat.toLowerCase()}`;
}

/**
 * Clinical Journey — a unified, reverse-chronological view of every clinical
 * event for a citizen. Aggregates existing records (enrollments, worklist
 * activities, outcomes, consultation notes) server-side without duplication.
 * Fully read-only; no data is created or modified.
 */
export default function ClinicalJourney({ citizenId }: { citizenId: string | null }) {
  const [entries, setEntries] = useState<ClinicalJourneyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!citizenId) { setEntries([]); setError(''); return; }
    const token = getToken();
    if (!token) return;
    let active = true;
    setLoading(true);
    setError('');
    setExpanded(new Set());
    fetchClinicalJourney(token, citizenId)
      .then((list) => { if (active) { setEntries(list); setLoading(false); } })
      .catch(() => { if (active) { setError('Unable to load clinical journey.'); setLoading(false); } });
    return () => { active = false; };
  }, [citizenId]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const visible = applyFilter(entries, filter);

  return (
    <div className="cz-journey">

      {/* ── Head ── */}
      <div className="cz-journey-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="cz-journey-title">Clinical Journey</span>
          {entries.length > 0 && (
            <span className="cz-count">{visible.length}</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>Read-only · Newest first</span>
      </div>

      {/* ── Filters ── */}
      <div className="cj-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`cz-filter-chip${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Event list ── */}
      <div className="cj-event-list">
        {loading ? (
          <div className="dash-loading">Loading clinical journey&hellip;</div>
        ) : error ? (
          <div className="dash-error">{error}</div>
        ) : !citizenId ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">👤</div>
            <div className="empty-state-text">Select a citizen to view their clinical journey.</div>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">∅</div>
            <div className="empty-state-text">
              {filter === 'all'
                ? 'No clinical events recorded yet.'
                : 'No events match this filter.'}
            </div>
          </div>
        ) : (
          visible.map((entry) => {
            const isOpen = expanded.has(entry.id);
            const hasClinical = !!(
              entry.clinicalNotes || entry.remarks || entry.generatedNote ||
              (entry.clinicalData && Object.keys(entry.clinicalData).length > 0)
            );
            const expandable = entry.eventType !== 'ENROLLMENT' && hasClinical;

            return (
              <div key={entry.id} className="cj-event">

                {/* ── Event header (always visible) ── */}
                <button
                  type="button"
                  className="cj-event-header"
                  onClick={() => expandable && toggle(entry.id)}
                  aria-expanded={expandable ? isOpen : undefined}
                  style={{ cursor: expandable ? 'pointer' : 'default' }}
                >
                  <div className={`cj-event-icon cj-event-icon--${entry.eventType.toLowerCase()}`}>
                    {eventIcon(entry)}
                  </div>

                  <div className="cj-event-body">
                    {/* Title row */}
                    <div className="cj-event-title">{entry.summary}</div>

                    {/* Meta row: type · program · disease · date time */}
                    <div className="cj-event-meta">
                      <span style={{ fontWeight: 700 }}>{eventLabel(entry)}</span>
                      {entry.program && <span>&nbsp;·&nbsp;{entry.program}</span>}
                      {entry.disease && <span>&nbsp;·&nbsp;{entry.disease}</span>}
                      <span>&nbsp;·&nbsp;{formatDate(entry.date)}</span>
                      {entry.date && (
                        <span style={{ color: '#b0b9c4' }}>&nbsp;{formatTime(entry.date)}</span>
                      )}
                    </div>

                    {/* Badges row */}
                    <div className="cj-event-meta" style={{ marginTop: 5, gap: 5 }}>
                      {entry.activityStatus && (
                        <span
                          className={`pill pill-${entry.activityStatus.toLowerCase()}`}
                          style={{ fontSize: 10 }}
                        >
                          {entry.activityStatus}
                        </span>
                      )}
                      {entry.enrollmentStatus && entry.eventType === 'ENROLLMENT' && (
                        <span
                          className={`pill pill-${entry.enrollmentStatus.toLowerCase()}`}
                          style={{ fontSize: 10 }}
                        >
                          {entry.enrollmentStatus}
                        </span>
                      )}
                      {entry.outcomeName && entry.outcomeCategory && (
                        <span
                          className={`pill ${catClass(entry.outcomeCategory)}`}
                          style={{ fontSize: 10 }}
                        >
                          {entry.outcomeName}
                        </span>
                      )}
                      {entry.callCount > 0 && (
                        <span style={{ fontSize: 10, color: '#0369a1', fontWeight: 600 }}>
                          📞 {entry.callCount} call{entry.callCount === 1 ? '' : 's'}
                        </span>
                      )}
                      {entry.recordedBy && (
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>
                          · {entry.recordedBy}
                        </span>
                      )}
                    </div>
                  </div>

                  {expandable && (
                    <span className="cj-event-caret" aria-hidden="true">
                      {isOpen ? '▾' : '▸'}
                    </span>
                  )}
                </button>

                {/* ── Expanded detail (consultation events only) ── */}
                {isOpen && expandable && (
                  <div className="cj-event-detail">

                    {entry.clinicalNotes && (
                      <div className="cj-detail-section">
                        <div className="cj-detail-label">Clinical Notes</div>
                        <div className="cj-detail-value">{entry.clinicalNotes}</div>
                      </div>
                    )}

                    {entry.remarks && (
                      <div className="cj-detail-section">
                        <div className="cj-detail-label">Remarks</div>
                        <div className="cj-detail-value">{entry.remarks}</div>
                      </div>
                    )}

                    {entry.clinicalData && Object.keys(entry.clinicalData).length > 0 && (
                      <div className="cj-detail-section">
                        <div className="cj-detail-label">Clinical Values</div>
                        <div className="cj-kv-grid">
                          {Object.entries(entry.clinicalData).map(([k, v]) => (
                            <div key={k} className="cj-kv-row">
                              <span className="cj-kv-key">{k}</span>
                              <span className="cj-kv-val">{String(v ?? '—')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {entry.generatedNote && (
                      <div className="cj-detail-section">
                        <div className="cj-detail-label">Clinical Note</div>
                        <pre className="cj-note-pre">{entry.generatedNote}</pre>
                      </div>
                    )}

                  </div>
                )}

              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
