'use client';

import { useEffect, useState } from 'react';
import { fetchDuplicateComparison, type DuplicateComparison } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useDialogA11y } from '@/lib/useDialogA11y';
import ComparisonColumns from './ComparisonColumns';

interface CompareRecordsDialogProps {
  requestId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Compare Records dialog — shows both patient records side-by-side so an
 * administrator can make an informed decision. Read-only. Renders the shared
 * {@link ComparisonColumns} (same component the Duplicate Review Workspace uses).
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

  // Shared dialog behaviour: Escape close, focus trap, focus restore (M35C).
  const dialogRef = useDialogA11y(open, onClose);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal modal-wide"
        ref={dialogRef} role="dialog"
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
            <ComparisonColumns data={data} />
          ) : null}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
