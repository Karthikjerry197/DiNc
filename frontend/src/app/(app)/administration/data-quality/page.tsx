'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  decideDuplicateRequest,
  fetchDuplicateComparison,
  fetchDuplicateRequests,
  duplicateReasonLabel,
  DUPLICATE_DECISION_LABEL,
  DUPLICATE_STATUS_LABEL,
  type DuplicateComparison,
  type DuplicateDecision,
  type DuplicateRequest,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { formatDate } from '@/lib/format';
import { useUser } from '@/lib/UserContext';
import ComingSoon from '@/components/shell/ComingSoon';
import ComparisonColumns from '@/components/dataquality/ComparisonColumns';
import { Inbox, Layers, RefreshCw, XCircle, Copy, ShieldQuestion } from 'lucide-react';
import { SkeletonLines } from '@/components/shell/Skeleton';

/** The three decision options rendered in the Decision panel. */
const DECISION_OPTIONS: {
  decision: DuplicateDecision;
  label: string;
  hint: string;
  icon: ReactNode;
  tone: 'danger' | 'neutral' | 'warn';
}[] = [
  {
    decision: 'REJECTED',
    label: 'Reject — Not a Duplicate',
    hint: 'Same name, different person, or filed in error. Request is rejected.',
    icon: <XCircle size={15} aria-hidden="true" />,
    tone: 'danger',
  },
  {
    decision: 'MULTIPLE_ENROLMENT',
    label: 'Valid Multiple Programme Enrolment',
    hint: 'Correctly enrolled in several programmes. Request is closed.',
    icon: <Layers size={15} aria-hidden="true" />,
    tone: 'neutral',
  },
  {
    decision: 'CONFIRMED_DUPLICATE',
    label: 'Confirm Duplicate',
    hint: 'Same person. Marks the request for archiving in a future step — nothing is merged or deleted now.',
    icon: <Copy size={15} aria-hidden="true" />,
    tone: 'warn',
  },
];

function patientLabel(p: DuplicateRequest['currentPatient']): string {
  const name = p.fullName ?? 'Unnamed';
  return p.uhid ? `${p.uhid} · ${name}` : name;
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`pill dq-status-${status.toLowerCase()}`}>
      {DUPLICATE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

/**
 * Administration → Data Quality → Duplicate Review Workspace.
 *
 * Three panels: the request List, the side-by-side Comparison, and the Decision
 * panel (status, reviewer, timeline, and the three review actions). Administrators
 * only. A "Confirmed Duplicate" records intent ONLY — archiving/merging is a
 * separate future milestone, so no citizen is ever archived, merged or deleted here.
 */
export default function DataQualityPage() {
  const { can } = useUser();
  const isAdmin = can('admin.data-quality');

  const [requests, setRequests] = useState<DuplicateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [comparison, setComparison] = useState<DuplicateComparison | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');

  const [decision, setDecision] = useState<DuplicateDecision | null>(null);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [decisionError, setDecisionError] = useState('');

  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const load = useCallback((keepSelection = true) => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchDuplicateRequests(token)
      .then((list) => {
        setRequests(list);
        setError('');
        setLoading(false);
        setSelectedId((current) => {
          if (keepSelection && current && list.some((r) => r.id === current)) return current;
          return list[0]?.id ?? null;
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load duplicate requests.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // Load the comparison + timeline whenever the selection changes.
  useEffect(() => {
    if (!selectedId) {
      setComparison(null);
      return;
    }
    const token = getToken();
    if (!token) return;
    let active = true;
    setCompareLoading(true);
    setCompareError('');
    setDecision(null);
    setComments('');
    setDecisionError('');
    fetchDuplicateComparison(token, selectedId)
      .then((d) => {
        if (active) {
          setComparison(d);
          setCompareLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setComparison(null);
          setCompareError(err instanceof Error ? err.message : 'Unable to load comparison.');
          setCompareLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const handleSubmit = useCallback(async () => {
    if (!selected || !decision || saving) return;
    const token = getToken();
    if (!token) {
      setDecisionError('Your session has expired. Please sign in again.');
      return;
    }
    if (!comments.trim()) {
      setDecisionError('Comments are required to record a decision.');
      return;
    }
    setSaving(true);
    setDecisionError('');
    try {
      await decideDuplicateRequest(token, selected.id, decision, comments.trim());
      flash(`Decision recorded: ${DUPLICATE_DECISION_LABEL[decision]}.`);
      setDecision(null);
      setComments('');
      load(true);
      // Refresh the comparison/timeline for the (now reviewed) request.
      const refreshed = await fetchDuplicateComparison(token, selected.id).catch(() => null);
      if (refreshed) setComparison(refreshed);
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : 'Unable to record the decision.');
    } finally {
      setSaving(false);
    }
  }, [selected, decision, comments, saving, flash, load]);

  if (!isAdmin) {
    return (
      <ComingSoon
        title="Data Quality"
        description="Duplicate request review is available to administrators only."
      />
    );
  }

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="page dqr-page">
      <div className="page-head">
        <div>
          <nav className="dq-breadcrumb" aria-label="Breadcrumb">
            <Link href="/administration">Administration</Link>
            <span aria-hidden="true"> / </span>
            <span>Data Quality</span>
          </nav>
          <h1 className="page-title">Duplicate Review</h1>
          <p className="page-subtitle">{pendingCount} pending · {requests.length} total</p>
        </div>
        <button type="button" className="btn btn-ghost dq-refresh" onClick={() => load(true)}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </button>
      </div>

      {error && <div className="dash-error">{error}</div>}

      <div className="dqr-workspace">
        {/* ── List panel ─────────────────────────────────────────────── */}
        <aside className="dqr-list panel" aria-label="Duplicate requests">
          {loading ? (
            <div className="dqr-pad"><SkeletonLines lines={6} /></div>
          ) : requests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
              <div className="empty-state-text">No duplicate requests submitted yet.</div>
            </div>
          ) : (
            <ul className="dqr-req-list">
              {requests.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`dqr-req${r.id === selectedId ? ' active' : ''}`}
                    onClick={() => setSelectedId(r.id)}
                    aria-current={r.id === selectedId}
                  >
                    <div className="dqr-req-top">
                      <span className="mono dqr-req-ref">{r.reference}</span>
                      <StatusChip status={r.status} />
                    </div>
                    <div className="dqr-req-names">
                      {patientLabel(r.currentPatient)}
                      <span className="dqr-req-vs"> vs </span>
                      {patientLabel(r.duplicatePatient)}
                    </div>
                    <div className="dqr-req-meta">
                      {r.submittedBy} · {formatDate(r.submittedAt)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ── Comparison panel ───────────────────────────────────────── */}
        <section className="dqr-compare panel" aria-label="Record comparison">
          {!selected ? (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true"><ShieldQuestion size={22} /></div>
              <div className="empty-state-text">Select a request to review.</div>
            </div>
          ) : compareLoading ? (
            <div className="dqr-pad"><SkeletonLines lines={10} /></div>
          ) : compareError ? (
            <div className="error-box dqr-pad">{compareError}</div>
          ) : comparison ? (
            <div className="dqr-compare-scroll">
              <div className="dqr-compare-head">
                <div>
                  <span className="mono">{comparison.request.reference}</span>
                  <span className="dqr-reason"> · {duplicateReasonLabel(comparison.request.reason)}</span>
                </div>
                <StatusChip status={comparison.request.status} />
              </div>
              {comparison.request.comments && (
                <div className="dqr-submitter-note">
                  <span className="dqr-note-label">Submitter comments</span>
                  <p>{comparison.request.comments}</p>
                </div>
              )}
              <ComparisonColumns data={comparison} />
            </div>
          ) : null}
        </section>

        {/* ── Decision panel ─────────────────────────────────────────── */}
        <aside className="dqr-decision panel" aria-label="Review decision">
          {!selected ? (
            <div className="dqr-pad dq-muted">No request selected.</div>
          ) : (
            <div className="dqr-decision-body">
              <div className="dqr-decision-status">
                <span className="dqr-note-label">Current status</span>
                <StatusChip status={selected.status} />
              </div>

              {selected.status === 'PENDING' ? (
                <>
                  <div className="dqr-note-label">Decision</div>
                  <div className="dqr-decision-options">
                    {DECISION_OPTIONS.map((opt) => (
                      <button
                        key={opt.decision}
                        type="button"
                        className={`dqr-option dqr-option--${opt.tone}${decision === opt.decision ? ' selected' : ''}`}
                        aria-pressed={decision === opt.decision}
                        disabled={saving}
                        onClick={() => setDecision(opt.decision)}
                      >
                        <span className="dqr-option-icon">{opt.icon}</span>
                        <span className="dqr-option-text">
                          <span className="dqr-option-label">{opt.label}</span>
                          <span className="dqr-option-hint">{opt.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="fg dqr-comments">
                    <label className="fl" htmlFor="dqr-comments">Comments *</label>
                    <textarea
                      id="dqr-comments"
                      className="fc modal-textarea"
                      placeholder="Mandatory — recorded in the audit trail"
                      value={comments}
                      disabled={saving}
                      maxLength={2000}
                      onChange={(e) => setComments(e.target.value)}
                    />
                  </div>

                  {decisionError && <div className="error-box">{decisionError}</div>}

                  <button
                    type="button"
                    className="btn btn-primary dqr-submit"
                    disabled={saving || !decision || !comments.trim()}
                    onClick={handleSubmit}
                  >
                    {saving ? 'Recording…' : 'Record Decision'}
                  </button>
                </>
              ) : (
                <div className="dqr-reviewed">
                  <div className="dqr-reviewed-row">
                    <span className="dqr-note-label">Decision</span>
                    <span>{selected.decision ? DUPLICATE_DECISION_LABEL[selected.decision] : '—'}</span>
                  </div>
                  <div className="dqr-reviewed-row">
                    <span className="dqr-note-label">Reviewed by</span>
                    <span>{selected.reviewedBy ?? '—'}</span>
                  </div>
                  <div className="dqr-reviewed-row">
                    <span className="dqr-note-label">Reviewed at</span>
                    <span>{selected.reviewedAt ? formatDate(selected.reviewedAt) : '—'}</span>
                  </div>
                  {selected.reviewComments && (
                    <div className="dqr-reviewed-note">
                      <span className="dqr-note-label">Reviewer comments</span>
                      <p>{selected.reviewComments}</p>
                    </div>
                  )}
                  {selected.status === 'CONFIRMED_DUPLICATE' && (
                    <div className="dqr-future">
                      Archiving / merging this confirmed duplicate will be available in a
                      later release. No records have been changed.
                    </div>
                  )}
                </div>
              )}

              {/* ── Timeline ─────────────────────────────────────────── */}
              {comparison && comparison.statusHistory.length > 0 && (
                <div className="dqr-timeline">
                  <div className="dqr-note-label">Timeline</div>
                  <ol className="dqr-timeline-list">
                    {comparison.statusHistory.map((h) => (
                      <li key={h.id} className="dqr-timeline-item">
                        <span className={`dqr-timeline-dot dq-status-${h.toStatus.toLowerCase()}`} aria-hidden="true" />
                        <div className="dqr-timeline-body">
                          <div className="dqr-timeline-status">
                            {DUPLICATE_STATUS_LABEL[h.toStatus] ?? h.toStatus}
                          </div>
                          <div className="dqr-timeline-meta">
                            {h.actor ?? 'system'} · {formatDate(h.createdAt)}
                          </div>
                          {h.comments && <div className="dqr-timeline-comment">{h.comments}</div>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {toast && <div className="cz-toast" role="status">{toast}</div>}
    </div>
  );
}
