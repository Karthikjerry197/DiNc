'use client';

import { useMemo, useState } from 'react';
import {
  saveConsultation,
  type ConsultationContext,
  type SaveConsultationResult,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import OutcomeRenderer, {
  fieldKey,
  initialValues,
  isFieldRequired,
  isFieldVisible,
} from './OutcomeRenderer';

interface ConsultationOutcomePanelProps {
  activityId: string;
  context: ConsultationContext;
  /**
   * Live clinical note from the counselling wizard — used as the consultation
   * note until the worker edits the field, so the summary stays live. Also the
   * source for the "Import Live Clinical Note" action into VA Notes.
   */
  generatedNote?: string;
  /** Counselling item IDs the worker checked during the session (for CDSE). */
  checkedItemIds?: string[];
  /** All item IDs available during the session (full protocol for CDSE). */
  counsellingItemIds?: string[];
  /** Disables the whole form (after a successful save). */
  disabled?: boolean;
  onSaved: (result: SaveConsultationResult) => void;
}

/** Today's date as an ISO yyyy-mm-dd string, for the read-only Call Date field. */
function todayIso(): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

/**
 * Disease-specific Consultation Outcome panel (M37I/J) — embedded inline in the
 * centre column (never a modal). It is a thin shell around the generic,
 * metadata-driven {@link OutcomeRenderer}: the panel owns the system-managed and
 * reused controls (read-only Call Date, the outcome-status dropdown, VA Notes),
 * while every programme-specific clinical field — of any type, in any section —
 * is rendered dynamically from the event's outcome template. There is NO
 * disease-specific logic here: adding a new programme requires only database
 * configuration. The selectable outcomes come from the event's configured
 * `outcome_types`; the form does not decide what happens next — the Workflow
 * Rules Engine does, server-side, when the outcome is saved. Save payload,
 * fields and logic are unchanged from the previous panel.
 */
export default function ConsultationOutcomePanel({
  activityId,
  context,
  generatedNote,
  checkedItemIds,
  counsellingItemIds,
  disabled = false,
  onSaved,
}: ConsultationOutcomePanelProps) {
  const options = context.outcomeOptions;
  const fields = context.clinicalForm.fields;

  const [outcomeTypeId, setOutcomeTypeId] = useState(
    () => options.find((o) => o.category === 'POSITIVE')?.id ?? options[0]?.id ?? '',
  );
  const [clinicalNotes, setClinicalNotes] = useState('');
  // The Live Clinical Note (right panel) is the single source of truth (M37G):
  // it is saved verbatim as the consultation note — no duplicate editor here.
  const remarks = generatedNote ?? '';
  // Seed values from each field's configured default (M37J).
  const [clinicalData, setClinicalData] = useState<Record<string, unknown>>(
    () => initialValues(fields),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Call Date is a system-generated field: the consultation date, read-only,
  // never user-editable. (Backend persistence/audit of this value is a separate
  // system concern and is not part of the configurable outcome form.)
  const callDate = useMemo(todayIso, []);

  // Auto header — derived from the consultation context, never hardcoded.
  const cc = context.clinicalContext;
  const outcomeSubject =
    cc.condition?.trim() || cc.program?.trim() || cc.activity?.trim() || '';
  const panelTitle = outcomeSubject ? `${outcomeSubject} Outcome` : 'Care Outcome';

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

  function setField(key: string, value: unknown) {
    setClinicalData((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Copy the entire Live Clinical Note (right panel) into VA Notes for editing.
   * Never overwrite existing notes without confirmation (M37J).
   */
  function importLiveNote() {
    if (!generatedNote) return;
    if (clinicalNotes.trim() && clinicalNotes.trim() !== generatedNote.trim()) {
      const ok = window.confirm(
        'Replace your current VA Notes with the Live Clinical Record? Your existing text will be overwritten.',
      );
      if (!ok) return;
    }
    setClinicalNotes(generatedNote);
  }

  /** Metadata-driven validation: only visible, effectively-required fields. */
  function validate(): string | null {
    if (!outcomeTypeId) return 'Please select a care outcome.';
    if (showClinicalFields) {
      for (const f of fields) {
        if (!isFieldVisible(f, clinicalData)) continue;
        if (!isFieldRequired(f, clinicalData)) continue;
        const v = clinicalData[fieldKey(f)];
        const empty =
          v === undefined ||
          v === null ||
          (Array.isArray(v) ? v.length === 0 : String(v).trim() === '');
        if (empty) return `Please complete the required field: ${f.label}.`;
      }
    }
    return null;
  }

  async function handleSave() {
    if (saving || disabled) return;
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
      setError(err instanceof Error ? err.message : 'Unable to save the care record.');
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || disabled;

  return (
    <div className="cw3-outcome">
      <div className="cw3-outcome-title">{panelTitle}</div>

      {error && <div className="error-box">{error}</div>}

      {/* Call Date (system, read-only) | Outcome Status (reused dropdown) */}
      <div className="cw3-dyn-grid">
        <div className="fg">
          <label className="fl" htmlFor="co-calldate">Call Date</label>
          <input
            id="co-calldate"
            className="fc"
            type="date"
            value={callDate}
            readOnly
            aria-readonly="true"
            tabIndex={-1}
            title="Care date — set automatically by the system"
          />
        </div>
        <div className="fg">
          <label className="fl" htmlFor="co-outcome">Outcome Status *</label>
          <select
            id="co-outcome"
            className="fc"
            value={outcomeTypeId}
            disabled={busy || options.length === 0}
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

        {/* Programme-specific fields — fully metadata-driven, any type/section */}
        {showClinicalFields ? (
          <OutcomeRenderer
            fields={fields}
            values={clinicalData}
            disabled={busy}
            onChange={setField}
          />
        ) : (
          <p className="tc-form-empty">
            Clinical assessment is captured for a successful or escalated
            care contact.
          </p>
        )}
      </div>

      {/* VA Notes — multiline, with a one-click import of the Live Clinical Note */}
      <div className="fg">
        <div className="cw3-notes-head">
          <label className="fl" htmlFor="co-notes">VA Notes</label>
          <button
            type="button"
            className="cw3-import-note"
            onClick={importLiveNote}
            disabled={busy || !generatedNote?.trim()}
          >
            Import Live Clinical Record
          </button>
        </div>
        <textarea
          id="co-notes"
          className="fc modal-textarea"
          placeholder="Observations, patient concerns, next plan…"
          value={clinicalNotes}
          disabled={busy}
          maxLength={4000}
          onChange={(e) => setClinicalNotes(e.target.value)}
        />
      </div>

      <div className="cw3-outcome-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={busy}
        >
          {saving ? 'Saving…' : 'Complete Care'}
        </button>
      </div>
    </div>
  );
}
