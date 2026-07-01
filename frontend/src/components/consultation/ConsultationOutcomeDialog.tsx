'use client';

import { useMemo, useState } from 'react';
import {
  saveConsultation,
  type ConsultationContext,
  type SaveConsultationResult,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import DynamicClinicalForm from './DynamicClinicalForm';

interface ConsultationOutcomeDialogProps {
  activityId: string;
  context: ConsultationContext;
  open: boolean;
  onClose: () => void;
  onSaved: (result: SaveConsultationResult) => void;
  /**
   * Live clinical note from the counselling wizard — pre-populated into the
   * Remarks field so the worker can review and edit before saving.
   */
  generatedNote?: string;
  /** Counselling item IDs the worker checked during the session (for CDSE). */
  checkedItemIds?: string[];
  /** All item IDs available during the session (full protocol for CDSE). */
  counsellingItemIds?: string[];
}

/**
 * Consultation Outcome form. The selectable outcomes come from the event's
 * configured `outcome_types` (database-driven) — the form does NOT decide what
 * happens next; the Workflow Rules Engine does, server-side, when the outcome is
 * saved. Always shows the general fields and renders program-specific clinical
 * fields dynamically from the event's outcome template.
 */
export default function ConsultationOutcomeDialog({
  activityId,
  context,
  open,
  onClose,
  onSaved,
  generatedNote,
  checkedItemIds,
  counsellingItemIds,
}: ConsultationOutcomeDialogProps) {
  const options = context.outcomeOptions;
  const [outcomeTypeId, setOutcomeTypeId] = useState(
    () => options.find((o) => o.category === 'POSITIVE')?.id ?? options[0]?.id ?? '',
  );
  const [clinicalNotes, setClinicalNotes] = useState('');
  // Pre-populated from the live counselling note — worker can edit before saving.
  const [remarks, setRemarks] = useState(() => generatedNote ?? '');
  const [clinicalData, setClinicalData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fields = context.clinicalForm.fields;

  const selected = useMemo(
    () => options.find((o) => o.id === outcomeTypeId) ?? null,
    [options, outcomeTypeId],
  );

  // Clinical observations are relevant for a successful or escalated contact;
  // for unreachable/neutral outcomes (retry, voicemail) they are skipped.
  const showClinicalFields = useMemo(
    () => selected?.category === 'POSITIVE' || selected?.category === 'ESCALATION',
    [selected],
  );

  if (!open) return null;

  function setField(label: string, value: unknown) {
    setClinicalData((prev) => ({ ...prev, [label]: value }));
  }

  function validate(): string | null {
    if (!outcomeTypeId) return 'Please select a consultation outcome.';
    if (showClinicalFields) {
      for (const f of fields) {
        if (f.required) {
          const v = clinicalData[f.label];
          if (v === undefined || v === null || String(v).trim() === '') {
            return `Please complete the required field: ${f.label}.`;
          }
        }
      }
    }
    return null;
  }

  async function handleSave() {
    setError('');
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    setSaving(true);
    try {
      const result = await saveConsultation(token, activityId, {
        outcomeTypeId,
        clinicalNotes: clinicalNotes.trim() || undefined,
        remarks: remarks.trim() || undefined,
        clinicalData: showClinicalFields ? clinicalData : undefined,
        generatedNote: remarks.trim() || undefined,
        noteStatus: 'FINAL',
        checkedItemIds: checkedItemIds ?? [],
        counsellingItemIds: counsellingItemIds ?? [],
      });
      onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the consultation.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consult-outcome-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="consult-outcome-title" className="modal-title">
            Consultation Outcome
            {context.patient.fullName ? ` · ${context.patient.fullName}` : ''}
          </h2>
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

          <div className="tc-outcome-grid">
            <section className="tc-outcome-section">
              <h3 className="tc-section-title">General</h3>

              <div className="fg">
                <label className="fl" htmlFor="co-outcome">Consultation Outcome *</label>
                <select
                  id="co-outcome"
                  className="fc"
                  value={outcomeTypeId}
                  disabled={saving || options.length === 0}
                  onChange={(e) => setOutcomeTypeId(e.target.value)}
                >
                  {options.length === 0 ? (
                    <option value="">No outcomes configured</option>
                  ) : (
                    options.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))
                  )}
                </select>
                {selected && (
                  <span className="tc-outcome-hint">
                    The next step is decided automatically by the workflow rules.
                  </span>
                )}
              </div>

              <div className="fg">
                <label className="fl" htmlFor="co-notes">Clinical Notes</label>
                <textarea
                  id="co-notes"
                  className="fc modal-textarea"
                  placeholder="Clinical observations from the consultation"
                  value={clinicalNotes}
                  disabled={saving}
                  maxLength={4000}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                />
              </div>

              <div className="fg">
                <label className="fl" htmlFor="co-remarks">
                  Consultation Note
                  {generatedNote && (
                    <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>
                      (pre-filled from counselling — edit if needed)
                    </span>
                  )}
                </label>
                <textarea
                  id="co-remarks"
                  className="fc modal-textarea co-note-textarea"
                  placeholder="Consultation observations and counselling summary"
                  value={remarks}
                  disabled={saving}
                  maxLength={8000}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </section>

            <section className="tc-outcome-section">
              <h3 className="tc-section-title">
                {context.clinicalForm.templateName ?? 'Clinical Assessment'}
                {context.clinicalContext.program ? (
                  <span className="tc-section-tag">{context.clinicalContext.program}</span>
                ) : null}
              </h3>
              {showClinicalFields ? (
                <DynamicClinicalForm
                  fields={fields}
                  values={clinicalData}
                  disabled={saving}
                  onChange={setField}
                />
              ) : (
                <p className="tc-form-empty">
                  Clinical assessment is captured for a successful or escalated
                  consultation.
                </p>
              )}
            </section>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Consultation'}
          </button>
        </div>
      </div>
    </div>
  );
}
