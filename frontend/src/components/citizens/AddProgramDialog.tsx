'use client';

import { useEffect, useState } from 'react';
import {
  createEnrollment,
  fetchDiseases,
  fetchEvents,
  fetchPrograms,
  fetchRegistrationOptions,
  fetchSubPrograms,
  type CreateEnrollmentResult,
  type DiseaseOption,
  type EventOption,
  type ProgramDto,
  type RegistrationOptions,
  type SubProgramOption,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useDialogA11y } from '@/lib/useDialogA11y';

interface AddProgramDialogProps {
  citizenId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreateEnrollmentResult) => void;
}

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'COMPLETED'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Add Program Enrollment dialog. Cascading Program → Sub-program → Condition
 * dropdowns are loaded from the existing read APIs. Only fields backed by real
 * schema columns are collected. Submits a single POST and reports backend
 * validation/duplicate/network errors professionally.
 */
export default function AddProgramDialog({
  citizenId,
  open,
  onClose,
  onCreated,
}: AddProgramDialogProps) {
  const [programs, setPrograms] = useState<ProgramDto[]>([]);
  const [subPrograms, setSubPrograms] = useState<SubProgramOption[]>([]);
  const [diseases, setDiseases] = useState<DiseaseOption[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);

  const [programId, setProgramId] = useState('');
  const [subProgramId, setSubProgramId] = useState('');
  const [diseaseId, setDiseaseId] = useState('');
  const [eventId, setEventId] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [status, setStatus] = useState('ACTIVE');
  const [remarks, setRemarks] = useState('');
  const [workers, setWorkers] = useState<RegistrationOptions['workers']>([]);
  const [assignedTo, setAssignedTo] = useState('');

  const [programsLoading, setProgramsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset and load programs each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const token = getToken();
    setProgramId('');
    setSubPrograms([]);
    setSubProgramId('');
    setDiseases([]);
    setDiseaseId('');
    setEvents([]);
    setEventId('');
    setStartDate(today());
    setStatus('ACTIVE');
    setRemarks('');
    setAssignedTo('');
    setError('');
    if (!token) return;

    let active = true;
    setProgramsLoading(true);
    fetchPrograms(token)
      .then((list) => {
        if (active) {
          setPrograms(list);
          setProgramsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to load programs.');
          setProgramsLoading(false);
        }
      });
    // Assignable workers — same source as the registration wizard.
    fetchRegistrationOptions(token)
      .then((options) => {
        if (active) setWorkers(options.workers);
      })
      .catch(() => {
        if (active) setWorkers([]);
      });
    return () => {
      active = false;
    };
  }, [open]);

  // Cascade: program → sub-programs.
  useEffect(() => {
    setSubPrograms([]);
    setSubProgramId('');
    setDiseases([]);
    setDiseaseId('');
    setEvents([]);
    setEventId('');
    if (!programId) return;
    const token = getToken();
    if (!token) return;

    let active = true;
    fetchSubPrograms(token, programId)
      .then((list) => {
        if (active) setSubPrograms(list);
      })
      .catch(() => {
        if (active) setSubPrograms([]);
      });
    return () => {
      active = false;
    };
  }, [programId]);

  // Cascade: sub-program → conditions (diseases).
  useEffect(() => {
    setDiseases([]);
    setDiseaseId('');
    if (!subProgramId) return;
    const token = getToken();
    if (!token) return;

    let active = true;
    fetchDiseases(token, subProgramId)
      .then((list) => {
        if (active) setDiseases(list);
      })
      .catch(() => {
        if (active) setDiseases([]);
      });
    return () => {
      active = false;
    };
  }, [subProgramId]);

  // Cascade: condition (disease) → events. Clears the previous event selection.
  useEffect(() => {
    setEvents([]);
    setEventId('');
    if (!diseaseId) return;
    const token = getToken();
    if (!token) return;

    let active = true;
    fetchEvents(token, diseaseId)
      .then((list) => {
        if (active) setEvents(list);
      })
      .catch(() => {
        if (active) setEvents([]);
      });
    return () => {
      active = false;
    };
  }, [diseaseId]);

  // Shared dialog behaviour: Escape close, focus trap, focus restore (M35C).
  const dialogRef = useDialogA11y(open, () => {
        if (!saving) onClose();
      });

  if (!open) return null;

  const canSave =
    !!programId && !!subProgramId && !!diseaseId && !!startDate && !saving;

  async function handleSave() {
    if (saving) return;
    setError('');
    if (!programId || !subProgramId || !diseaseId || !startDate) {
      setError('Please complete all required fields.');
      return;
    }
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }

    setSaving(true);
    try {
      const result = await createEnrollment(token, citizenId, {
        programId,
        diseaseId,
        eventId: eventId || undefined,
        startDate,
        status,
        remarks: remarks.trim() ? remarks.trim() : undefined,
        assignedTo: assignedTo || undefined,
      });
      onCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add program enrollment.');
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
        aria-labelledby="add-program-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="add-program-title" className="modal-title">Add Program Enrollment</h2>
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

          <div className="fg">
            <label className="fl" htmlFor="ap-program">Program *</label>
            <select
              id="ap-program"
              className="fc"
              value={programId}
              disabled={programsLoading || saving}
              onChange={(e) => setProgramId(e.target.value)}
            >
              <option value="">{programsLoading ? 'Loading…' : 'Select a program'}</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="ap-subprogram">Sub Program *</label>
            <select
              id="ap-subprogram"
              className="fc"
              value={subProgramId}
              disabled={!programId || saving}
              onChange={(e) => setSubProgramId(e.target.value)}
            >
              <option value="">
                {!programId
                  ? 'Select a program first'
                  : subPrograms.length === 0
                    ? 'No sub-programs available'
                    : 'Select a sub-program'}
              </option>
              {subPrograms.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="ap-condition">Condition *</label>
            <select
              id="ap-condition"
              className="fc"
              value={diseaseId}
              disabled={!subProgramId || saving}
              onChange={(e) => setDiseaseId(e.target.value)}
            >
              <option value="">
                {!subProgramId
                  ? 'Select a sub-program first'
                  : diseases.length === 0
                    ? 'No conditions available'
                    : 'Select a condition'}
              </option>
              {diseases.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="ap-event">Event</label>
            <select
              id="ap-event"
              className="fc"
              value={eventId}
              disabled={!diseaseId || saving}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">
                {!diseaseId
                  ? 'Select a condition first'
                  : events.length === 0
                    ? 'No events available'
                    : 'Select an event (optional)'}
              </option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="ap-worker">Assign Worker</label>
            <select
              id="ap-worker"
              className="fc"
              value={assignedTo}
              disabled={saving}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="">— Unassigned —</option>
              {workers.map((w) => (
                <option key={w.username} value={w.username}>
                  {w.fullName} · {w.role}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-row">
            <div className="fg">
              <label className="fl" htmlFor="ap-date">Enrollment Date *</label>
              <input
                id="ap-date"
                type="date"
                className="fc"
                value={startDate}
                disabled={saving}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="fg">
              <label className="fl" htmlFor="ap-status">Status</label>
              <select
                id="ap-status"
                className="fc"
                value={status}
                disabled={saving}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="ap-remarks">Remarks</label>
            <textarea
              id="ap-remarks"
              className="fc modal-textarea"
              placeholder="Optional notes"
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
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save Enrollment'}
          </button>
        </div>
      </div>
    </div>
  );
}
