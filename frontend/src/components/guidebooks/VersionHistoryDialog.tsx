'use client';

import { useEffect, useState } from 'react';
import { fetchGuidebookVersions, type GuidebookVersion } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useDialogA11y } from '@/lib/useDialogA11y';
import { SkeletonLines } from '@/components/shell/Skeleton';

interface VersionHistoryDialogProps {
  open: boolean;
  guidebookId: string | null;
  guidebookTitle: string;
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  BASELINE: 'Initial record',
  IMPORTED: 'Imported',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Read-only version history for the selected guidebook, from guidebook_versions.
 * Every guidebook has at least a baseline version; future edit paths append
 * versions automatically, so this dialog needs no changes when editing arrives.
 */
export default function VersionHistoryDialog({
  open,
  guidebookId,
  guidebookTitle,
  onClose,
}: VersionHistoryDialogProps) {
  const [versions, setVersions] = useState<GuidebookVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !guidebookId) return;
    const token = getToken();
    if (!token) return;
    let active = true;
    setLoading(true);
    setError('');
    fetchGuidebookVersions(token, guidebookId)
      .then((list) => {
        if (active) {
          setVersions(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to load version history.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, guidebookId]);

  // Shared dialog behaviour: Escape close, focus trap, focus restore (M35C).
  const dialogRef = useDialogA11y(open, onClose);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal"
        ref={dialogRef} role="dialog"
        aria-modal="true"
        aria-labelledby="version-history-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="version-history-title" className="modal-title">Version History</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="dq-dialog-note">{guidebookTitle}</p>

          {error && <div className="error-box">{error}</div>}

          {loading ? (
            <SkeletonLines lines={3} />
          ) : versions.length === 0 && !error ? (
            <p className="gb-section-empty">No version history recorded.</p>
          ) : (
            <ul className="ip-preview-list">
              {versions.map((v) => (
                <li key={v.versionNumber}>
                  <span>
                    <strong>Version {v.versionNumber}</strong>
                    {' · '}
                    {ACTION_LABELS[v.action] ?? v.action}
                    {v.changeSummary && v.changeSummary !== (ACTION_LABELS[v.action] ?? '')
                      ? ` · ${v.changeSummary}`
                      : ''}
                    {v.changedBy ? ` · by ${v.changedBy}` : ''}
                  </span>
                  <span className="ip-preview-kind">{formatDateTime(v.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
