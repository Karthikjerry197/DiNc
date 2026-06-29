'use client';

import { useEffect, useState } from 'react';
import {
  fetchDuplicateComparison,
  type DuplicateComparison,
  type PatientComparisonSide,
} from '@/lib/api';
import { getToken } from '@/lib/session';

interface CompareRecordsDialogProps {
  requestId: string;
  open: boolean;
  onClose: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Renders one patient column of the side-by-side comparison. */
function PatientColumn({
  side,
  heading,
}: {
  side: PatientComparisonSide;
  heading: string;
}) {
  const c = side.citizen;
  return (
    <div className="dq-compare-col">
      <div className="dq-compare-heading">{heading}</div>

      <div className="dq-compare-section">
        <div className="dq-compare-label">UHID</div>
        <div className="mono dq-compare-uhid">{c.uhid ?? '—'}</div>
      </div>

      <div className="dq-compare-section">
        <div className="dq-compare-label">Demographics</div>
        <dl className="dq-demo">
          <div><dt>Name</dt><dd>{c.fullName ?? '—'}</dd></div>
          <div><dt>Age</dt><dd>{c.age ?? '—'}</dd></div>
          <div><dt>Gender</dt><dd>{c.gender ?? '—'}</dd></div>
          <div><dt>Phone</dt><dd>{c.phone ?? '—'}</dd></div>
          <div><dt>District</dt><dd>{c.district ?? '—'}</dd></div>
        </dl>
      </div>

      <div className="dq-compare-section">
        <div className="dq-compare-label">Programs ({side.programs.length})</div>
        {side.programs.length > 0 ? (
          <div className="dq-chips">
            {side.programs.map((p) => (
              <span key={p.id ?? p.name} className="dq-chip">{p.name}</span>
            ))}
          </div>
        ) : (
          <div className="dq-muted">No programs.</div>
        )}
      </div>

      <div className="dq-compare-section">
        <div className="dq-compare-label">Enrollments ({side.enrollments.length})</div>
        {side.enrollments.length > 0 ? (
          <ul className="dq-list">
            {side.enrollments.map((e) => (
              <li key={e.id}>
                <span className="dq-list-main">{e.program.name ?? '—'}</span>
                <span className="dq-list-sub">
                  {(e.subProgram?.name ?? '—')} · {formatDate(e.enrollmentDate)} ·{' '}
                  <span className={`pill pill-${e.status.toLowerCase()}`}>{e.status}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dq-muted">No enrollments.</div>
        )}
      </div>

      <div className="dq-compare-section">
        <div className="dq-compare-label">Activities ({side.activities.length})</div>
        {side.activities.length > 0 ? (
          <ul className="dq-list">
            {side.activities.slice(0, 8).map((a) => (
              <li key={a.id}>
                <span className="dq-list-main">{a.activity ?? '—'}</span>
                <span className="dq-list-sub">
                  {(a.program ?? '—')} · {formatDate(a.dueDate)} ·{' '}
                  <span className={`pill pill-${a.status.toLowerCase()}`}>{a.status}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dq-muted">No activities.</div>
        )}
      </div>

      <div className="dq-compare-section">
        <div className="dq-compare-label">Guidebooks ({side.guidebooks.length})</div>
        {side.guidebooks.length > 0 ? (
          <ul className="dq-list">
            {side.guidebooks.map((g) => (
              <li key={g.id}>
                <span className="dq-list-main">{g.title}</span>
                <span className="dq-list-sub">{g.code} · {g.category}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dq-muted">No matched guidebooks.</div>
        )}
      </div>
    </div>
  );
}

/**
 * Compare Records dialog — shows both patient records side-by-side so an
 * administrator can make an informed approve/reject decision. Read-only.
 */
export default function CompareRecordsDialog({
  requestId,
  open,
  onClose,
}: CompareRecordsDialogProps) {
  const [data, setData] = useState<DuplicateComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError('');
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    let active = true;
    setLoading(true);
    fetchDuplicateComparison(token, requestId)
      .then((d) => {
        if (active) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load comparison.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, requestId]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-records-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="compare-records-title" className="modal-title">
            Compare Records{data ? ` · ${data.request.reference}` : ''}
          </h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}
          {loading ? (
            <div className="dash-loading">Loading comparison&hellip;</div>
          ) : data ? (
            <div className="dq-compare-grid">
              <PatientColumn side={data.current} heading="Current Patient" />
              <PatientColumn side={data.duplicate} heading="Possible Duplicate" />
            </div>
          ) : null}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
