'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

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
import ConsultationOutcomePanel from '@/components/consultation/ConsultationOutcomePanel';
import ClinicalDecisionPanel from '@/components/consultation/ClinicalDecisionPanel';
import CarePlanPanel from '@/components/care-plan/CarePlanPanel';
import Workspace from '@/components/workspace/Workspace';
import Panel from '@/components/workspace/Panel';
import PanelContent from '@/components/workspace/PanelContent';
import { useWorkspaceShell } from '@/components/workspace/useWorkspaceShell';
import { useOverflowFades } from '@/components/workspace/useOverflowFades';
import { Check, CircleAlert, CircleCheck, MapPin, Phone, TriangleAlert } from 'lucide-react';
import { humanizeSectionKey } from '@/components/guidebooks/GuidebookTabs';
import { SkeletonLines } from '@/components/shell/Skeleton';

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
    return <p className="cw-history-empty">No previous care records.</p>;
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
                    <span className="cw-history-field-label">Care Record</span>
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

  // Fixed 3-column workspace (M37B) — page never scrolls as one container.
  useWorkspaceShell();

  // Horizontal-overflow edge fades when the 3-column grid scrolls (M39.1).
  const gridRef = useOverflowFades<HTMLDivElement>();

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

  // Counselling selections (drive the live note + CDSE mapping)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Return URL (set from ?returnUrl= query param on mount; supports Citizens → Workspace flow)
  const [returnUrl, setReturnUrl] = useState('/worklist');

  // Save result (consultation completed)
  const [saveResult, setSaveResult] = useState<SaveConsultationResult | null>(null);

  // The inline outcome form (End Call / Record Outcome scroll target)
  const outcomeRef = useRef<HTMLDivElement | null>(null);

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

  // Read returnUrl from the query string once on mount. Only internal app
  // paths are accepted — an absolute or protocol-relative URL here would let a
  // crafted link redirect the worker off-site after saving (open redirect).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('returnUrl');
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) setReturnUrl(raw);
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
        setError(err instanceof Error ? err.message : 'Unable to load care record.');
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

  const scrollToOutcome = useCallback(() => {
    outcomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleEndCall = useCallback(() => {
    setCallPhase('ended');
    scrollToOutcome();
  }, [scrollToOutcome]);

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setNoteMode('auto');
  }, []);

  const handleNoteChange = useCallback((value: string) => {
    setManualNote(value);
    setNoteMode('manual');
  }, []);

  const handleNoteReset = useCallback(() => {
    setManualNote('');
    setNoteMode('auto');
  }, []);

  const handleOutcomeSaved = useCallback((result: SaveConsultationResult) => {
    setSaveResult(result);
    // Brief pause so the worker sees the success state before navigating
    setTimeout(() => router.push(returnUrl), 1200);
  }, [router, returnUrl]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page">
        <SkeletonLines lines={8} />
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

  // Danger-sign sections surface in the centre panel as bordered cards (M37B);
  // the remaining protocol sections stay in the left checklist. Same items,
  // same selectedIds, same CDSE mapping — presentation only.
  const isDangerSection = (name: string) => /danger/i.test(name);
  const dangerItems = sections
    .filter((s) => isDangerSection(s.name))
    .flatMap((s) => s.items);
  const protocolSections = sections.filter((s) => !isDangerSection(s.name));

  // Referral-chain info bar (M37C) — the guidebook's referral/escalation
  // section rendered as the reference's blue strip. Data-driven; hidden when
  // the guidebook has no such section.
  const refEntry = Object.entries(ctx.guidebook?.sections ?? {}).find(([key]) =>
    /referral|escalat/i.test(key),
  );
  const referralChainText = refEntry
    ? (Array.isArray(refEntry[1]) ? refEntry[1].join(' · ') : refEntry[1]).trim()
    : '';

  const noteWords = displayNote.trim() ? displayNote.trim().split(/\s+/).length : 0;

  return (
    <Workspace aria-label="Care" className="cw3-root">

      {/* ── Single compact header row: call action + patient metadata ──
        * The breadcrumb and patient strip were merged in here (M37E) so the
        * three-column workspace starts directly under the app header. */}
      <div className={`cw-consult-callbar cw3-callbar cw-consult-callbar-${callPhase}`}>
        {callPhase === 'ready' && (
          <button
            type="button"
            className="cw-consult-call-btn"
            onClick={handleStartCall}
            disabled={callStarting}
          >
            <span className="cw-consult-call-icon"><Phone size={16} aria-hidden="true" /></span>
            {callStarting
              ? 'Starting call…'
              : patient.phone
                ? `Call ${patient.phone}`
                : 'Start Call'}
          </button>
        )}

        {callPhase === 'in-progress' && (
          <>
            <span className="cw-call-dot" aria-hidden="true" />
            <span className="cw-consult-call-status">Call In Progress</span>
            <span className="cw-consult-call-timer">{formatDuration(callSeconds)}</span>
          </>
        )}

        {/* Patient identity as inline metadata — always visible on a clinical screen */}
        <span className="cw3-callbar-meta">
          <span className="cw3-patient-name">{patient.fullName ?? '—'}</span>
          {patient.uhid && (
            <>
              <span className="cw3-meta-sep" aria-hidden="true">•</span>
              <span className="cw3-patient-uhid">{patient.uhid}</span>
            </>
          )}
          {cc.program && (
            <>
              <span className="cw3-meta-sep" aria-hidden="true">•</span>
              <span className="cw3-patient-program">{cc.program}</span>
            </>
          )}
          {cc.condition && (
            <>
              <span className="cw3-meta-sep" aria-hidden="true">•</span>
              <span className="cw3-patient-cond">{cc.condition}</span>
            </>
          )}
          {totalSelected > 0 && (
            <>
              <span className="cw3-meta-sep" aria-hidden="true">•</span>
              <span className="cw3-patient-sel">
                {totalSelected} item{totalSelected === 1 ? '' : 's'} selected
              </span>
            </>
          )}
        </span>

        {callPhase === 'ready' && (
          <>
            {callError && <span className="cw-consult-callerr">{callError}</span>}
            <span className="cw-consult-call-hint cw3-callbar-right">
              Select counselling items during the call — the note updates live
            </span>
          </>
        )}

        {callPhase === 'in-progress' && (
          <button
            type="button"
            className="btn btn-danger cw3-callbar-right"
            style={{ fontSize: 13, padding: '6px 16px' }}
            onClick={handleEndCall}
          >
            End Call
          </button>
        )}

        {callPhase === 'ended' && !saveResult && (
          <>
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              Call ended — record the outcome to complete care.
            </span>
            <button
              type="button"
              className="btn btn-primary cw3-callbar-right"
              style={{ fontSize: 13, padding: '6px 16px' }}
              onClick={scrollToOutcome}
            >
              Record Outcome →
            </button>
          </>
        )}

        {saveResult && (
          <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>
            <CircleCheck size={14} aria-hidden="true" /> Care saved
            {saveResult.workflowMessage ? ` · ${saveResult.workflowMessage}` : ''} — returning…
          </span>
        )}
      </div>

      {/* ── Fixed 3-column workspace: Protocol · Clinical Decision · Note ── */}
      <div className="wsg-host wsg-host--card">
      <div className="cw3-grid" ref={gridRef}>

        {/* LEFT — Protocol (steps counter · Guide/Script tabs · checklist) */}
        <Panel aria-label="Protocol" className="cw3-left">
          <CounsellingWizard
            sections={protocolSections}
            selectedIds={selectedIds}
            onToggle={handleToggle}
            disabled={!!saveResult}
            guidebook={ctx.guidebook}
          />
        </Panel>

        {/* CENTRE — Danger Signs & Outcome (primary workspace, scrollable) */}
        <Panel aria-label="Clinical decision" className="cw3-center">
          <div className="cw3-col-head cw3-col-head--danger">
            <CircleAlert size={15} aria-hidden="true" />
            Danger Signs &amp; Outcome
          </div>
          <PanelContent>
            {dangerItems.length > 0 && (
              <>
                <div className="cw3-danger-label">
                  <TriangleAlert size={12} aria-hidden="true" />
                  Check all signs present
                </div>
                <div className="cw3-danger-list" role="group" aria-label="Danger signs">
                  {dangerItems.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        className={`cw3-danger-card${isSelected ? ' cw3-danger-card-sel' : ''}`}
                        onClick={() => !saveResult && handleToggle(item.id)}
                        disabled={!!saveResult}
                      >
                        <span className="cw3-step-check" aria-hidden="true">
                          {isSelected ? <Check size={13} /> : null}
                        </span>
                        <span className="cw3-danger-text">{item.body}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Outcome form — inline (same fields, logic and save as before) */}
            <div ref={outcomeRef}>
              <ConsultationOutcomePanel
                activityId={activityId}
                context={ctx}
                generatedNote={displayNote || undefined}
                checkedItemIds={[...selectedIds]}
                counsellingItemIds={sections.flatMap((s) => s.items.map((i) => i.id))}
                disabled={!!saveResult}
                onSaved={handleOutcomeSaved}
              />
            </div>

            {/* Referral chain — guidebook referral/escalation guidance */}
            {referralChainText && refEntry && (
              <div className="cw3-refchain">
                <MapPin size={13} aria-hidden="true" />
                <span>
                  <strong>{humanizeSectionKey(refEntry[0])}:</strong> {referralChainText}
                </span>
              </div>
            )}

            {/* Clinical risk classification (CDSE) — unchanged component */}
            <ClinicalDecisionPanel citizenId={patient.citizenId} />

            {/* Care plan — unchanged component */}
            <CarePlanPanel
              citizenId={patient.citizenId}
              citizenName={patient.fullName}
              worklistItemId={ctx.activity?.id}
            />

            <div className="cw-history-head" style={{ marginTop: 16 }}>Care History</div>
            <HistoryPanel history={history} />
          </PanelContent>
        </Panel>

        {/* RIGHT — Live Clinical Note (fixed) */}
        <Panel aria-label="Live clinical record" className="cw3-right">
          <div className="cw3-col-head">
            Live Clinical Record
            <span className="cw3-words">{noteWords} words</span>
          </div>
          <PanelContent className="cw3-note-body">
            <DocumentationPreview
              note={displayNote}
              mode={noteMode}
              disabled={!!saveResult}
              noteSaving={noteSaving}
              onChange={handleNoteChange}
              onReset={handleNoteReset}
            />
          </PanelContent>
        </Panel>

      </div>
      </div>
    </Workspace>
  );
}
