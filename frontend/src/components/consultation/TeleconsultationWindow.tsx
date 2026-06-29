'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchConsultationContext,
  startCall as startCallApi,
  type ConsultationContext,
  type SaveConsultationResult,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import ConsultationOutcomeDialog from './ConsultationOutcomeDialog';

interface TeleconsultationWindowProps {
  activityId: string;
  open: boolean;
  onClose: () => void;
  /** Called after a consultation is saved so the opener can refresh its data. */
  onCompleted: (result: SaveConsultationResult) => void;
}

type Phase = 'ready' | 'in-progress' | 'ended';

function value(text: string | null | undefined): string {
  return text && String(text).trim() ? String(text) : '—';
}

/**
 * Teleconsultation window — the dedicated consultation surface opened from the
 * 📞 action. It presents patient information, clinical context and quick actions,
 * drives the call lifecycle (Start → In Progress → End), and on End Call opens the
 * Consultation Outcome form automatically.
 */
export default function TeleconsultationWindow({
  activityId,
  open,
  onClose,
  onCompleted,
}: TeleconsultationWindowProps) {
  const [context, setContext] = useState<ConsultationContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>('ready');
  const [starting, setStarting] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setContext(null);
    setError('');
    setPhase('ready');
    setOutcomeOpen(false);
    setNote('');

    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    let active = true;
    setLoading(true);
    fetchConsultationContext(token, activityId)
      .then((ctx) => {
        if (active) {
          setContext(ctx);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load consultation.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, activityId]);

  const handleStartCall = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    setStarting(true);
    setError('');
    try {
      const res = await startCallApi(token, activityId);
      // Hand off to the device dialer (tel:). Placeholder for future VOIP — the
      // tel: scheme launches the dialer without navigating away from this page.
      if (res.dial.telLink) {
        window.location.href = res.dial.telLink;
      } else {
        setNote('No phone number on file — proceeding without auto-dial.');
      }
      setPhase('in-progress');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start the call.');
    } finally {
      setStarting(false);
    }
  }, [activityId]);

  function openGuidebook() {
    const g = context?.guidebook;
    if (g) {
      window.open(`/guidebooks?g=${g.id}`, '_blank', 'noopener');
    } else {
      setNote('No specific guidebook is mapped to this activity.');
    }
  }

  function openPatient() {
    const id = context?.patient.citizenId;
    if (id) window.open(`/citizens?c=${id}`, '_blank', 'noopener');
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal modal-wide tc-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tc-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="tc-title" className="modal-title">Teleconsultation</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}
          {note && <div className="dq-dialog-note">{note}</div>}

          {loading ? (
            <div className="dash-loading">Loading consultation&hellip;</div>
          ) : context ? (
            <>
              <div className="tc-grid">
                <section className="tc-panel">
                  <h3 className="tc-section-title">Patient Information</h3>
                  <dl className="tc-info">
                    <div><dt>UHID</dt><dd className="mono">{value(context.patient.uhid)}</dd></div>
                    <div><dt>Name</dt><dd>{value(context.patient.fullName)}</dd></div>
                    <div><dt>Age</dt><dd>{value(context.patient.age?.toString())}</dd></div>
                    <div><dt>Gender</dt><dd>{value(context.patient.gender)}</dd></div>
                    <div><dt>Phone</dt><dd>{value(context.patient.phone)}</dd></div>
                    <div><dt>Assigned Worker</dt><dd>{value(context.patient.assignedWorker)}</dd></div>
                  </dl>
                </section>

                <section className="tc-panel">
                  <h3 className="tc-section-title">Clinical Context</h3>
                  <dl className="tc-info">
                    <div><dt>Program</dt><dd>{value(context.clinicalContext.program)}</dd></div>
                    <div><dt>Condition</dt><dd>{value(context.clinicalContext.condition)}</dd></div>
                    <div><dt>Current Activity</dt><dd>{value(context.clinicalContext.activity)}</dd></div>
                    <div>
                      <dt>Enrollment Status</dt>
                      <dd>
                        <span className={`pill pill-${(context.clinicalContext.enrollmentStatus ?? '').toLowerCase()}`}>
                          {value(context.clinicalContext.enrollmentStatus)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Activity Status</dt>
                      <dd>
                        <span className={`pill pill-${context.activity.status.toLowerCase()}`}>
                          {context.activity.status}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>

              <div className="tc-quick-actions">
                <button type="button" className="btn btn-ghost" onClick={openGuidebook}>
                  📖 Guidebook
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={openPatient}
                  disabled={!context.patient.citizenId}
                >
                  👁 Open Patient
                </button>
              </div>

              <div className="tc-call-bar">
                {phase === 'ready' && (
                  <button
                    type="button"
                    className="btn btn-primary tc-call-btn"
                    onClick={handleStartCall}
                    disabled={starting}
                  >
                    {starting ? 'Starting…' : '📞 Start Call'}
                  </button>
                )}

                {phase === 'in-progress' && (
                  <>
                    <span className="tc-call-status">
                      <span className="tc-call-dot" aria-hidden="true" /> Call In Progress
                    </span>
                    <button
                      type="button"
                      className="btn btn-danger tc-call-btn"
                      onClick={() => {
                        setPhase('ended');
                        setOutcomeOpen(true);
                      }}
                    >
                      End Call
                    </button>
                  </>
                )}

                {phase === 'ended' && (
                  <button
                    type="button"
                    className="btn btn-ghost tc-call-btn"
                    onClick={() => setOutcomeOpen(true)}
                  >
                    Record Outcome
                  </button>
                )}
              </div>
            </>
          ) : null}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>

      {context && outcomeOpen && (
        <ConsultationOutcomeDialog
          activityId={activityId}
          context={context}
          open={outcomeOpen}
          onClose={() => setOutcomeOpen(false)}
          onSaved={(result) => {
            setOutcomeOpen(false);
            onCompleted(result);
          }}
        />
      )}
    </div>
  );
}
