'use client';

import { useEffect, useRef, useState } from 'react';
import {
  fetchCarePlanSummary,
  recordProgress,
  type CarePlanSummary,
  type ProgressType,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import CarePlanEditor from './CarePlanEditor';

interface Props {
  citizenId: string | null | undefined;
  citizenName?: string | null;
  worklistItemId?: string | null;
}

/**
 * Collapsible care plan panel for the consultation workspace right column.
 * Shows a lightweight summary and quick progress entry. Opens the full
 * CarePlanEditor in a slide-over when the worker clicks "Open Full Plan".
 */
export default function CarePlanPanel({ citizenId, citizenName, worklistItemId }: Props) {
  const [summary, setSummary] = useState<CarePlanSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  // Quick progress entry
  const [progressNote, setProgressNote] = useState('');
  const [progressType, setProgressType] = useState<ProgressType>('UPDATE');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!citizenId) return;
    const token = getToken();
    if (!token) return;

    setLoading(true);
    fetchCarePlanSummary(token, citizenId)
      .then((data) => {
        if (!mountedRef.current) return;
        setSummary(data);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [citizenId]);

  if (!citizenId) return null;

  async function handleQuickProgress() {
    const token = getToken();
    if (!token || !summary || !progressNote.trim()) return;
    setSaving(true);
    try {
      await recordProgress(token, summary.id, {
        progressNote: progressNote.trim(),
        progressType,
        worklistItemId: worklistItemId ?? undefined,
      });
      if (mountedRef.current) {
        setProgressNote('');
        setSavedMsg('Progress recorded.');
        setTimeout(() => { if (mountedRef.current) setSavedMsg(''); }, 3000);
        // Refresh summary counts
        const updated = await fetchCarePlanSummary(token, citizenId!);
        if (mountedRef.current) setSummary(updated);
      }
    } catch {
      if (mountedRef.current) setSavedMsg('Failed to save progress.');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  return (
    <>
      <div className="cp-panel">
        {/* ── Panel header ── */}
        <div className="cp-panel-head">
          <div className="cp-panel-title-row">
            <span className="cp-panel-title">Care Plan</span>
            {summary && (
              <span className={`cp-plan-status-badge cp-plan-status--${summary.status.toLowerCase()}`}>
                {summary.status}
              </span>
            )}
          </div>
          <button
            type="button"
            className="cdse-collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand care plan' : 'Collapse care plan'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>

        {/* ── Panel body ── */}
        {!collapsed && (
          <div className="cp-panel-body">
            {loading && (
              <div className="cdse-loading">
                <span className="cdse-loading-dot" />
                Loading care plan…
              </div>
            )}

            {!loading && !summary && (
              <div className="cp-panel-empty">
                <span className="cp-panel-empty-text">No care plan yet for this citizen.</span>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ marginTop: 8, fontSize: 11, padding: '5px 12px' }}
                  onClick={() => setEditorOpen(true)}
                >
                  Create Care Plan
                </button>
              </div>
            )}

            {!loading && summary && (
              <>
                {/* Summary stats */}
                <div className="cp-panel-stats">
                  <div className="cp-panel-stat">
                    <span className="cp-panel-stat-value">{summary.activeProblems}</span>
                    <span className="cp-panel-stat-label">Active Problems</span>
                  </div>
                  <div className="cp-panel-stat">
                    <span className="cp-panel-stat-value">{summary.activeGoals}</span>
                    <span className="cp-panel-stat-label">Active Goals</span>
                  </div>
                  <div className="cp-panel-stat">
                    <span className="cp-panel-stat-value cp-stat-achieved">{summary.achievedGoals}</span>
                    <span className="cp-panel-stat-label">Achieved</span>
                  </div>
                </div>

                {/* Quick progress entry */}
                <div className="cp-quick-progress">
                  <div className="cp-quick-progress-label">Record Progress</div>
                  <textarea
                    className="fc cp-quick-progress-ta"
                    rows={2}
                    placeholder="Note what was discussed or observed today…"
                    value={progressNote}
                    onChange={(e) => setProgressNote(e.target.value)}
                    maxLength={4000}
                  />
                  <div className="cp-quick-progress-row">
                    <select
                      className="fc cp-quick-type-sel"
                      value={progressType}
                      onChange={(e) => setProgressType(e.target.value as ProgressType)}
                    >
                      <option value="UPDATE">Update</option>
                      <option value="ASSESSMENT">Assessment</option>
                      <option value="REVIEW">Review</option>
                      <option value="ACHIEVEMENT">Achievement</option>
                    </select>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ fontSize: 11, padding: '5px 12px' }}
                      onClick={handleQuickProgress}
                      disabled={saving || !progressNote.trim()}
                    >
                      {saving ? '…' : 'Save'}
                    </button>
                  </div>
                  {savedMsg && (
                    <div className="cp-quick-saved">{savedMsg}</div>
                  )}
                </div>

                {/* Open full plan */}
                <button
                  type="button"
                  className="cp-open-full-btn"
                  onClick={() => setEditorOpen(true)}
                >
                  Open Full Care Plan →
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Full editor slide-over ── */}
      {editorOpen && (
        <div className="cp-slideover-backdrop" onClick={() => setEditorOpen(false)}>
          <div className="cp-slideover" onClick={(e) => e.stopPropagation()}>
            <CarePlanEditor
              citizenId={citizenId}
              citizenName={citizenName}
              onClose={() => {
                setEditorOpen(false);
                // Re-fetch summary so panel reflects any changes made in the editor
                const token = getToken();
                if (token) {
                  fetchCarePlanSummary(token, citizenId!).then((s) => {
                    if (mountedRef.current) setSummary(s);
                  }).catch(() => {});
                }
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
