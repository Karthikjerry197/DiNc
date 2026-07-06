'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createDuplicateRequest,
  fetchCitizensList,
  DUPLICATE_REASONS,
  type CitizenListItem,
  type DuplicateRequest,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useDialogA11y } from '@/lib/useDialogA11y';

export interface ReportDuplicateTarget {
  id: string;
  uhid: string | null;
  fullName: string | null;
}

interface ReportDuplicateDialogProps {
  /** The patient being reported as having a possible duplicate (read-only). */
  current: ReportDuplicateTarget;
  open: boolean;
  onClose: () => void;
  onSubmitted: (request: DuplicateRequest) => void;
}

function citizenLabel(c: CitizenListItem): string {
  const name = c.fullName ?? 'Unnamed';
  return `${c.uhid} · ${name}`;
}

/**
 * Report Duplicate dialog. Workers never delete a patient — they file an
 * auditable Duplicate Request that an administrator later reviews. The current
 * patient is fixed; the possible duplicate is chosen from the citizen list.
 */
export default function ReportDuplicateDialog({
  current,
  open,
  onClose,
  onSubmitted,
}: ReportDuplicateDialogProps) {
  const [citizens, setCitizens] = useState<CitizenListItem[]>([]);
  const [citizensLoading, setCitizensLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [duplicateId, setDuplicateId] = useState('');
  const [reason, setReason] = useState(DUPLICATE_REASONS[0].value);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset and load the citizen list each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setSearch('');
    setDuplicateId('');
    setReason(DUPLICATE_REASONS[0].value);
    setComments('');
    setError('');

    const token = getToken();
    if (!token) return;
    let active = true;
    setCitizensLoading(true);
    fetchCitizensList(token)
      .then((list) => {
        if (active) {
          setCitizens(list.filter((c) => c.id !== current.id));
          setCitizensLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to load patients.');
          setCitizensLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, current.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return citizens.slice(0, 50);
    return citizens
      .filter(
        (c) =>
          c.uhid.toLowerCase().includes(q) ||
          (c.fullName ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [citizens, search]);

  // Shared dialog behaviour: Escape close, focus trap, focus restore (M35C).
  const dialogRef = useDialogA11y(open, () => {
        if (!saving) onClose();
      });

  if (!open) return null;

  const canSave = !!duplicateId && !!reason && !saving;

  async function handleSubmit() {
    if (saving) return;
    setError('');
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    if (!duplicateId) {
      setError('Please select the possible duplicate patient.');
      return;
    }
    setSaving(true);
    try {
      const request = await createDuplicateRequest(token, {
        currentCitizenId: current.id,
        duplicateCitizenId: duplicateId,
        reason,
        comments: comments.trim() ? comments.trim() : undefined,
      });
      onSubmitted(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit duplicate request.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="modal"
        ref={dialogRef} role="dialog"
        aria-modal="true"
        aria-labelledby="report-duplicate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="report-duplicate-title" className="modal-title">Report Duplicate Patient</h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}

          <p className="dq-dialog-note">
            This does not delete any records. It creates a request for an
            administrator to review.
          </p>

          <div className="fg">
            <label className="fl">Current Patient</label>
            <div className="dq-fixed-patient">
              <span className="mono">{current.uhid ?? '—'}</span>
              <span>{current.fullName ?? 'Unnamed'}</span>
            </div>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="rd-search">Find Possible Duplicate *</label>
            <input
              id="rd-search"
              className="fc"
              placeholder={citizensLoading ? 'Loading patients…' : 'Search by UHID or name'}
              value={search}
              disabled={citizensLoading || saving}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="fg">
            <label className="fl" htmlFor="rd-duplicate">Possible Duplicate Patient *</label>
            <select
              id="rd-duplicate"
              className="fc"
              size={5}
              value={duplicateId}
              disabled={saving}
              onChange={(e) => setDuplicateId(e.target.value)}
            >
              {filtered.length === 0 ? (
                <option value="" disabled>No matching patients</option>
              ) : (
                filtered.map((c) => (
                  <option key={c.id} value={c.id}>{citizenLabel(c)}</option>
                ))
              )}
            </select>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="rd-reason">Reason *</label>
            <select
              id="rd-reason"
              className="fc"
              value={reason}
              disabled={saving}
              onChange={(e) => setReason(e.target.value)}
            >
              {DUPLICATE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="rd-comments">Comments</label>
            <textarea
              id="rd-comments"
              className="fc modal-textarea"
              placeholder="Optional context for the reviewer"
              value={comments}
              disabled={saving}
              maxLength={2000}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={!canSave}>
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}
