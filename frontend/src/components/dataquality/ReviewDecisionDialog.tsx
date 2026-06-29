'use client';

import { useEffect, useState } from 'react';

export interface ReviewDecisionConfig {
  title: string;
  /** Short description / consequence shown above the remarks field. */
  message: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive when true. */
  destructive?: boolean;
  /** Whether remarks are required before confirming. */
  remarksRequired?: boolean;
}

interface ReviewDecisionDialogProps {
  open: boolean;
  config: ReviewDecisionConfig;
  saving: boolean;
  error: string;
  onConfirm: (remarks: string) => void;
  onClose: () => void;
}

/**
 * Small confirmation dialog used for every duplicate-request decision
 * (approve / reject / merge / delete). Captures the optional review remarks that
 * are written into the audit trail.
 */
export default function ReviewDecisionDialog({
  open,
  config,
  saving,
  error,
  onConfirm,
  onClose,
}: ReviewDecisionDialogProps) {
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (open) setRemarks('');
  }, [open]);

  if (!open) return null;

  const canConfirm = !saving && (!config.remarksRequired || remarks.trim().length > 0);

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-decision-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="review-decision-title" className="modal-title">{config.title}</h2>
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
          <p className="dq-dialog-note">{config.message}</p>

          <div className="fg">
            <label className="fl" htmlFor="rv-remarks">
              Remarks{config.remarksRequired ? ' *' : ' (optional)'}
            </label>
            <textarea
              id="rv-remarks"
              className="fc modal-textarea"
              placeholder="Recorded in the audit trail"
              value={remarks}
              disabled={saving}
              maxLength={2000}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${config.destructive ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => onConfirm(remarks.trim())}
            disabled={!canConfirm}
          >
            {saving ? 'Working…' : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
