'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import {
  fetchConsultationContext,
  fetchConsultationHistory,
  startCall as startCallApi,
  upsertConsultationNote,
  type ConsultationContext,
  type ConsultationHistoryEntry,
  type SaveConsultationResult,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useDocumentationEngine } from '@/components/consultation/useDocumentationEngine';
import DocumentationPreview from '@/components/consultation/DocumentationPreview';
import CounsellingWizard from '@/components/consultation/CounsellingWizard';
import ConsultationOutcomeDialog from '@/components/consultation/ConsultationOutcomeDialog';

type CallPhase = 'ready' | 'in-progress' | 'ended';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Consultation History Panel ────────────────────────────────────────────────

function HistoryPanel({ history }: { history: ConsultationHistoryEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (history.length === 0) {
    return <p className="cw-history-empty">No previous consultations recorded.</p>;
  }

  return (
    <div className="cw-history-list">
      {history.map((entry) => {
        const isOpen = expanded.has(entry.activityId);
        const hasNote = !!entry.generatedNote?.trim();
        const hasFields =
          entry.clinicalData && Object.keys(entry.clinicalData).length > 0;
        const dateStr = entry.date
          ? new Date(entry.date).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : '—';

        return (
          <div key={entry.activityId} className="cw-history-item">
            <button
              type="button"
              className="cw-history-header"
              onClick={() => toggle(entry.activityId)}
              aria-expanded={isOpen}
            >
              <div className="cw-history-left">
                <div className="cw-history-title">{entry.eventName}</div>
                <div className="cw-history-meta">
                  {entry.program && <span>{entry.program} · </span>}
                  <span>{dateStr}</span>
                  {entry.recordedBy && <span> · {entry.recordedBy}</span>}
                </div>
                {entry.outcomeName && (
                  <div className="cw-history-outcome">
                    <span
                      className={`pill pill-${(entry.outcomeCategory ?? 'neutral').toLowerCase()}`}
                      style={{ fontSize: 10 }}
                    >
                      {entry.outcomeName}
                    </span>
                  </div>
                )}
              </div>
              <span className="cw-history-toggle" aria-hidden="true">
                {isOpen ? '▾' : '▸'}
              </span>
            </button>

            {isOpen && (
              <div className="cw-history-detail">
                {entry.clinicalNotes && (
                  <div className="cw-history-field">
                    <span className="cw-history-field-label">Clinical Notes</span>
                    <p className="cw-history-field-value">{entry.clinicalNotes}</p>
                  </div>
                )}
                {entry.remarks && (
                  <div className="cw-history-field">
                    <span className="cw-history-field-label">Remarks</span>
                    <p className="cw-history-field-value">{entry.remarks}</p>
                  </div>
                )}
                {hasFields && (
                  <div className="cw-history-field">
                    <span className="cw-history-field-label">Clinical Values</span>
                    <div className="cw-history-fields-grid">
                      {Object.entries(entry.clinicalData!).map(([k, v]) => (
                        <div key={k} className="cw-history-kv">
                          <span className="cw-history-kv-key">{k}</span>
                          <span className="cw-history-kv-val">{String(v ?? '—')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {hasNote && (
                  <div className="cw-history-field">
                    <span className="cw-history-field-label">Consultation Note</span>
                    <pre className="cw-history-note">{entry.generatedNote}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ConsultationWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const activityId = params.id as string;
  const token = getToken() ?? '';

  // Context and history
  const [ctx, setCtx] = useState<ConsultationContext | null>(null);
  const [history, setHistory] = useState<ConsultationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Call lifecycle
  const [callPhase, setCallPhase] = useState<CallPhase>('ready');
  const [callStarting, setCallStarting] = useState(false);
  const [callError, setCallError] = useState('');
  const [callSeconds, setCallSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Counselling wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Return URL (set from ?returnUrl= query param on mount; supports Citizens → Workspace flow)
  const [returnUrl, setReturnUrl] = useState('/worklist');

  // Outcome dialog
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveConsultationResult | null>(null);

  // Note state
  const [noteMode, setNoteMode] = useState<'auto' | 'manual'>('auto');
  const [manualNote, setManualNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Auto-generated note driven by counselling selections
  const autoNote = useDocumentationEngine(
    ctx,
    {},
    '',
    '',
    '',
    selectedIds,
  );
  const displayNote = noteMode === 'auto' ? autoNote : manualNote;

  // Read returnUrl from the query string once on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('returnUrl');
    if (raw) setReturnUrl(raw);
  }, []);

  // Load context on mount
  useEffect(() => {
    if (!token || !activityId) { setLoading(false); return; }
    let alive = true;
    setLoading(true);

    fetchConsultationContext(token, activityId)
      .then((data) => {
        if (!alive) return;
        setCtx(data);
        if (data.previousNote?.status === 'DRAFT') {
          setManualNote(data.previousNote.generatedNote);
          setNoteMode('manual');
        }
        setLoading(false);
        if (data.patient.citizenId) {
          fetchConsultationHistory(token, data.patient.citizenId)
            .then((h) => { if (alive) setHistory(h); })
            .catch(() => undefined);
        }
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Unable to load consultation.');
        setLoading(false);
      });

    return () => { alive = false; };
  }, [token, activityId]);

  // Call duration timer — counts while call is in progress
  useEffect(() => {
    if (callPhase === 'in-progress') {
      timerRef.current = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callPhase]);

  // Auto-save DRAFT note — debounced 6 seconds
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!token || !activityId || !ctx || saveResult) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      if (!displayNote.trim()) return;
      setNoteSaving(true);
      upsertConsultationNote(token, activityId, displayNote)
        .catch(() => undefined)
        .finally(() => setNoteSaving(false));
    }, 6000);
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activityId, ctx, saveResult, displayNote]);

  const handleStartCall = useCallback(async () => {
    if (!token) return;
    setCallStarting(true);
    setCallError('');
    try {
      const res = await startCallApi(token, activityId);
      if (res.dial.telLink) {
        window.location.href = res.dial.telLink;
      }
      setCallPhase('in-progress');
      setCallSeconds(0);
    } catch (err) {
      setCallError(err instanceof Error ? err.message : 'Unable to start the call.');
    } finally {
      setCallStarting(false);
    }
  }, [token, activityId]);

  const handleEndCall = useCallback(() => {
    setCallPhase('ended');
    setOutcomeOpen(true);
  }, []);

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setNoteMode('auto');
  }, []);

  // When wizard's "Complete →" is pressed on the last section, open outcome dialog
  const handleStep = useCallback((step: number) => {
    if (!ctx) return;
    const sections = ctx.counsellingSections ?? [];
    if (step >= sections.length) {
      setOutcomeOpen(true);
    } else {
      setCurrentStep(Math.max(0, step));
    }
  }, [ctx]);

  const handleNoteChange = useCallback((value: string) => {
    setManualNote(value);
    setNoteMode('manual');
  }, []);

  const handleNoteReset = useCallback(() => {
    setManualNote('');
    setNoteMode('auto');
  }, []);

  const handleOutcomeSaved = useCallback((result: SaveConsultationResult) => {
    setOutcomeOpen(false);
    setSaveResult(result);
    // Brief pause so the worker sees the success state before navigating
    setTimeout(() => router.push(returnUrl), 1200);
  }, [router, returnUrl]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page">
        <div className="cw-loading">Loading consultation workspace&hellip;</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="cw-error">{error}</div>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
          ← Back
        </button>
      </div>
    );
  }

  if (!ctx) return null;

  const patient = ctx.patient;
  const cc = ctx.clinicalContext;
  const sections = ctx.counsellingSections ?? [];
  const totalSelected = selectedIds.size;

  return (
    <div className="page cw-page-root">

      {/* ── Patient header ── */}
      <div className="cw-header">
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="cw-breadcrumb">
            <Link href={returnUrl}>
              {returnUrl.startsWith('/citizens') ? 'Citizens' : 'My Worklist'}
            </Link>
            <span className="cw-breadcrumb-sep">›</span>
            Consultation
          </div>
          <div className="cw-patient-badge">
            <span className="cw-patient-name">{patient.fullName ?? '—'}</span>
            {patient.uhid && (
              <>
                <span className="cw-patient-sep">·</span>
                <span className="cw-patient-uhid">{patient.uhid}</span>
              </>
            )}
            {cc.program && (
              <>
                <span className="cw-patient-sep">·</span>
                <span className="cw-patient-program">{cc.program}</span>
              </>
            )}
            {cc.condition && (
              <>
                <span className="cw-patient-sep">·</span>
                <span className="cw-patient-activity">{cc.condition}</span>
              </>
            )}
            {totalSelected > 0 && (
              <>
                <span className="cw-patient-sep">·</span>
                <span style={{ fontSize: 11, color: '#0369a1', fontWeight: 600 }}>
                  {totalSelected} item{totalSelected === 1 ? '' : 's'} selected
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Call status bar ── */}
      <div className={`cw-consult-callbar cw-consult-callbar-${callPhase}`}>
        {callPhase === 'ready' && (
          <>
            {callError && (
              <span className="cw-consult-callerr">{callError}</span>
            )}
            <button
              type="button"
              className="cw-consult-call-btn"
              onClick={handleStartCall}
              disabled={callStarting}
            >
              <span className="cw-consult-call-icon">📞</span>
              {callStarting
                ? 'Starting call…'
                : patient.phone
                  ? `Call ${patient.fullName ?? 'Patient'} · ${patient.phone}`
                  : `Start Consultation · ${patient.fullName ?? 'Patient'}`}
            </button>
            <span className="cw-consult-call-hint">
              Select counselling items during the call — the note updates live
            </span>
          </>
        )}

        {callPhase === 'in-progress' && (
          <>
            <span className="cw-call-dot" aria-hidden="true" />
            <span className="cw-consult-call-status">Call In Progress</span>
            <span className="cw-consult-call-timer">{formatDuration(callSeconds)}</span>
            <button
              type="button"
              className="btn btn-danger"
              style={{ marginLeft: 'auto', fontSize: 13, padding: '7px 18px' }}
              onClick={handleEndCall}
            >
              End Call
            </button>
          </>
        )}

        {callPhase === 'ended' && !saveResult && (
          <>
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              Call ended — record the outcome to complete the consultation.
            </span>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginLeft: 'auto', fontSize: 13, padding: '7px 18px' }}
              onClick={() => setOutcomeOpen(true)}
            >
              Record Outcome →
            </button>
          </>
        )}

        {saveResult && (
          <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>
            ✓ Consultation saved — returning…
          </span>
        )}
      </div>

      {/* ── 2-column workspace ── */}
      <div className="cw-workspace-b">

        {/* Left: Counselling Wizard */}
        <div className="cw-wizard-col">
          <CounsellingWizard
            sections={sections}
            selectedIds={selectedIds}
            currentStep={currentStep}
            onToggle={handleToggle}
            onStep={handleStep}
            disabled={!!saveResult}
          />
        </div>

        {/* Right: Live Clinical Note + History */}
        <div className="cw-note-col">
          <div className="cw-note-col-head">Live Clinical Note</div>
          <DocumentationPreview
            note={displayNote}
            mode={noteMode}
            disabled={!!saveResult}
            noteSaving={noteSaving}
            onChange={handleNoteChange}
            onReset={handleNoteReset}
          />

          <div className="cw-history-head" style={{ marginTop: 16 }}>Previous Consultations</div>
          <HistoryPanel history={history} />
        </div>

      </div>

      {/* ── Outcome dialog — opens on End Call or wizard Complete ── */}
      {ctx && outcomeOpen && (
        <ConsultationOutcomeDialog
          activityId={activityId}
          context={ctx}
          open={outcomeOpen}
          generatedNote={displayNote || undefined}
          onClose={() => {
            setOutcomeOpen(false);
            // If call was ended, let the worker re-open from the call bar
          }}
          onSaved={handleOutcomeSaved}
        />
      )}

    </div>
  );
}
