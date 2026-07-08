'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createActivity,
  fetchActiveActivity,
  fetchActivityOptions,
  type ActiveActivity,
  type ActivityEntry,
  type EnrollmentSummary,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { formatDate } from '@/lib/format';
import { useDialogA11y } from '@/lib/useDialogA11y';

interface StartConsultationDialogProps {
  citizenId: string;
  enrollments: EnrollmentSummary[];
  /** The citizen's activities (worklist-wide) — used to enrich the scheduled-activity summary. */
  activities?: ActivityEntry[];
  open: boolean;
  onClose: () => void;
}

type Step = 'checking' | 'scheduled-found' | 'select-program' | 'creating';

/**
 * Handles the "Start Consultation" entry point from the Citizens module.
 *
 * Flow:
 *  1. Check whether the citizen has an active/due worklist activity.
 *  2a. If yes → "Scheduled Consultation Found" dialog (Continue or Start New).
 *  2b. If no  → Programme + Event selector → create activity → navigate.
 *
 * In both cases the user lands in the SAME Consultation Workspace used by the
 * Worklist. The `?returnUrl=` param carries the Citizens URL so the workspace
 * navigates back here after saving, not to the Worklist.
 */
export default function StartConsultationDialog({
  citizenId,
  enrollments,
  activities = [],
  open,
  onClose,
}: StartConsultationDialogProps) {
  const router = useRouter();

  const [step, setStep] = useState<Step>('checking');
  const [activeActivity, setActiveActivity] = useState<ActiveActivity | null>(null);
  const [error, setError] = useState('');

  // New-consultation form fields
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');
  const [eventId, setEventId] = useState('');
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const activeEnrollments = enrollments.filter((e) => e.status === 'ACTIVE');

  // When the dialog opens, check for an existing active activity.
  useEffect(() => {
    if (!open) return;
    const token = getToken();
    if (!token) return;

    setStep('checking');
    setError('');
    setActiveActivity(null);
    setSelectedEnrollmentId(activeEnrollments[0]?.id ?? '');
    setEventId('');
    setEvents([]);

    fetchActiveActivity(token, citizenId)
      .then((result) => {
        if (result) {
          setActiveActivity(result);
          setStep('scheduled-found');
        } else {
          setStep('select-program');
        }
      })
      .catch(() => {
        // On check failure, proceed to the new-consultation form.
        setStep('select-program');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, citizenId]);

  // Load events whenever the selected enrollment changes (in select-program step).
  useEffect(() => {
    if (step !== 'select-program' || !selectedEnrollmentId) return;
    const token = getToken();
    if (!token) return;

    let active = true;
    setEventsLoading(true);
    setEventId('');
    setEvents([]);

    fetchActivityOptions(token, selectedEnrollmentId)
      .then((opts) => {
        if (!active) return;
        setEvents(opts.events);
        const defaultId =
          (opts.defaultEventId && opts.events.find((e) => e.id === opts.defaultEventId)?.id) ??
          opts.events[0]?.id ??
          '';
        setEventId(defaultId);
        setEventsLoading(false);
      })
      .catch(() => {
        if (active) setEventsLoading(false);
      });

    return () => { active = false; };
  }, [selectedEnrollmentId, step]);

  function navigateToConsultation(activityId: string) {
    const returnUrl = encodeURIComponent(`/citizens?c=${citizenId}`);
    router.push(`/worklist/${activityId}/consult?returnUrl=${returnUrl}`);
    onClose();
  }

  async function handleCreateAndNavigate() {
    if (submitting) return;
    const token = getToken();
    if (!token || !selectedEnrollmentId || !eventId) return;

    setSubmitting(true);
    setError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const activity = await createActivity(token, selectedEnrollmentId, {
        eventId,
        dueDate: today,
      });
      navigateToConsultation(activity.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start care.');
      setSubmitting(false);
    }
  }

  // Shared dialog behaviour: Escape close, focus trap, focus restore (M35C).
  const dialogRef = useDialogA11y(open, () => { if (!submitting) onClose(); });

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={() => { if (!submitting) onClose(); }}
    >
      <div
        className="modal"
        ref={dialogRef} role="dialog"
        aria-modal="true"
        aria-labelledby="sc-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480 }}
      >

        {/* ── Checking ── */}
        {step === 'checking' && (
          <>
            <div className="modal-head">
              <span id="sc-dialog-title" className="modal-title">Checking…</span>
            </div>
            <div className="modal-body">
              <div className="dash-loading">Checking for scheduled care&hellip;</div>
            </div>
          </>
        )}

        {/* ── Scheduled consultation found ── */}
        {step === 'scheduled-found' && activeActivity && (
          <>
            <div className="modal-head">
              <h2 id="sc-dialog-title" className="modal-title">Scheduled Care Activity Found</h2>
              <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: '#374151', marginBottom: 12 }}>
                A scheduled care activity already exists for this citizen.
              </p>
              {(() => {
                // Enrich the summary from the citizen's worklist activities
                // (same worklist id); fall back to the active-activity payload.
                const match = activities.find((a) => a.id === activeActivity.activityId);
                const dash = '—';
                const rows: { label: string; value: string }[] = [
                  { label: 'Programme', value: activeActivity.programName || match?.program || dash },
                  { label: 'Activity', value: activeActivity.eventName || match?.activity || dash },
                  { label: 'Due Date', value: match?.dueDate ? formatDate(match.dueDate) : dash },
                  { label: 'Priority', value: match?.priority || dash },
                  { label: 'Status', value: match?.status || dash },
                ];
                return (
                  <dl className="sc-activity-card">
                    {rows.map((row) => (
                      <div key={row.label} className="sc-activity-field">
                        <dt className="sc-activity-label">{row.label}</dt>
                        <dd className="sc-activity-value">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                );
              })()}
            </div>
            <div className="modal-foot" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigateToConsultation(activeActivity.activityId)}
              >
                Continue
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setStep('select-program');
                  setSelectedEnrollmentId(activeEnrollments[0]?.id ?? '');
                }}
              >
                Create New Care Activity
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {/* ── No active activity — select programme and event ── */}
        {step === 'select-program' && (
          <>
            <div className="modal-head">
              <h2 id="sc-dialog-title" className="modal-title">Start Call</h2>
              <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={submitting}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-box">{error}</div>}

              {activeEnrollments.length === 0 ? (
                <p style={{ fontSize: 14, color: '#6b7280' }}>
                  No active program enrollments found. Please enrol this citizen in a program first.
                </p>
              ) : (
                <>
                  <div className="fg">
                    <label className="fl" htmlFor="sc-enrollment">Programme *</label>
                    <select
                      id="sc-enrollment"
                      className="fc"
                      value={selectedEnrollmentId}
                      disabled={submitting}
                      onChange={(e) => setSelectedEnrollmentId(e.target.value)}
                    >
                      {activeEnrollments.map((e) => (
                        <option key={e.id} value={e.id}>{e.program.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="fg">
                    <label className="fl" htmlFor="sc-event">Event *</label>
                    <select
                      id="sc-event"
                      className="fc"
                      value={eventId}
                      disabled={eventsLoading || submitting || events.length === 0}
                      onChange={(e) => setEventId(e.target.value)}
                    >
                      <option value="">
                        {eventsLoading
                          ? 'Loading events…'
                          : events.length === 0
                            ? 'No events available'
                            : 'Select an event'}
                      </option>
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>{ev.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              {activeEnrollments.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!eventId || submitting}
                  onClick={handleCreateAndNavigate}
                >
                  {submitting ? 'Starting…' : 'Start Call'}
                </button>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
