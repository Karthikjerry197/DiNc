'use client';

import { useEffect, useRef, useState } from 'react';
import {
  addGoal,
  addIntervention,
  addProblem,
  createCarePlan,
  deleteGoal,
  deleteIntervention,
  deleteProblem,
  fetchCarePlan,
  fetchCdseSuggestions,
  fetchProgress,
  recordCdseDecisions,
  recordProgress,
  updateCarePlan,
  updateGoal,
  updateGoalStatus,
  updateIntervention,
  type CarePlan,
  type CarePlanProgress,
  type CdseDecisionEntry,
  type CdseGoalSuggestion,
  type GoalCategory,
  type GoalPriority,
  type GoalStatus,
  type InterventionStatus,
  type ProblemStatus,
  type ProgressType,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import GoalCard from './GoalCard';
import ProgressTimeline from './ProgressTimeline';
import CdseGoalSuggestions from './CdseGoalSuggestions';

type ActiveTab = 'plan' | 'progress' | 'cdse';

interface AddGoalForm {
  open: boolean;
  problemId: string;
  title: string;
  category: GoalCategory;
  priority: GoalPriority;
  description: string;
  targetValue: string;
  targetDate: string;
}

interface AddInterventionForm {
  open: boolean;
  goalId: string;
  title: string;
  description: string;
  frequency: string;
  responsible: string;
  assignedTo: string;
  dueDate: string;
}

interface AddProblemForm {
  open: boolean;
  title: string;
  description: string;
  identifiedDate: string;
  status: ProblemStatus;
}

interface Props {
  citizenId: string;
  citizenName?: string | null;
  onClose?: () => void;
}

export default function CarePlanEditor({ citizenId, citizenName, onClose }: Props) {
  const [plan, setPlan] = useState<CarePlan | null>(null);
  const [progress, setProgress] = useState<CarePlanProgress[]>([]);
  const [cdse, setCdse] = useState<CdseGoalSuggestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('plan');
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [cdseLoaded, setCdseLoaded] = useState(false);
  const mountedRef = useRef(true);

  // ── Form states ────────────────────────────────────────────────────────────
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [addProblemForm, setAddProblemForm] = useState<AddProblemForm>({
    open: false, title: '', description: '', identifiedDate: '', status: 'ACTIVE',
  });
  const [addGoalForm, setAddGoalForm] = useState<AddGoalForm>({
    open: false, problemId: '', title: '', category: 'CLINICAL', priority: 'ROUTINE',
    description: '', targetValue: '', targetDate: '',
  });
  const [addInterventionForm, setAddInterventionForm] = useState<AddInterventionForm>({
    open: false, goalId: '', title: '', description: '', frequency: '',
    responsible: '', assignedTo: '', dueDate: '',
  });

  // Progress quick-entry
  const [progressNote, setProgressNote] = useState('');
  const [progressType, setProgressType] = useState<ProgressType>('UPDATE');
  const [progressGoalId, setProgressGoalId] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    loadPlan();
  }, [citizenId]);

  async function loadPlan() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchCarePlan(token, citizenId);
      if (!mountedRef.current) return;
      setPlan(data);
    } catch {
      if (!mountedRef.current) return;
      setError('Unable to load care plan.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function handleTabChange(tab: ActiveTab) {
    setActiveTab(tab);
    const token = getToken();
    if (!token || !plan) return;

    if (tab === 'progress' && !progressLoaded) {
      try {
        const data = await fetchProgress(token, plan.id);
        if (mountedRef.current) { setProgress(data); setProgressLoaded(true); }
      } catch { /* non-fatal */ }
    }

    if (tab === 'cdse' && !cdseLoaded) {
      try {
        const data = await fetchCdseSuggestions(token, plan.id);
        if (mountedRef.current) { setCdse(data); setCdseLoaded(true); }
      } catch { /* non-fatal */ }
    }
  }

  async function handleCreatePlan() {
    const token = getToken();
    if (!token || !newPlanTitle.trim()) return;
    setSaving(true);
    try {
      const created = await createCarePlan(token, citizenId, {
        title: newPlanTitle.trim(),
        summary: `Integrated care plan for ${citizenName ?? 'citizen'}`,
      });
      if (mountedRef.current) setPlan(created);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to create care plan.');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleStatusChange(status: string) {
    const token = getToken();
    if (!token || !plan) return;
    setSaving(true);
    try {
      const updated = await updateCarePlan(token, plan.id, { status: status as any });
      if (mountedRef.current) setPlan(updated);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleAddProblem() {
    const token = getToken();
    if (!token || !plan || !addProblemForm.title.trim()) return;
    setSaving(true);
    try {
      const updated = await addProblem(token, plan.id, {
        title: addProblemForm.title.trim(),
        description: addProblemForm.description.trim() || undefined,
        identifiedDate: addProblemForm.identifiedDate || undefined,
        status: addProblemForm.status,
      });
      if (mountedRef.current) {
        setPlan(updated);
        setAddProblemForm({ open: false, title: '', description: '', identifiedDate: '', status: 'ACTIVE' });
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleDeleteProblem(problemId: string) {
    const token = getToken();
    if (!token || !plan) return;
    if (!window.confirm('Remove this problem and all its goals?')) return;
    setSaving(true);
    try {
      const updated = await deleteProblem(token, plan.id, problemId);
      if (mountedRef.current) setPlan(updated);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleAddGoal() {
    const token = getToken();
    if (!token || !plan || !addGoalForm.title.trim()) return;
    setSaving(true);
    try {
      await addGoal(token, plan.id, addGoalForm.problemId, {
        title: addGoalForm.title.trim(),
        category: addGoalForm.category,
        priority: addGoalForm.priority,
        description: addGoalForm.description.trim() || undefined,
        targetValue: addGoalForm.targetValue.trim() || undefined,
        targetDate: addGoalForm.targetDate || undefined,
      });
      const updated = await fetchCarePlan(token, citizenId);
      if (mountedRef.current) {
        setPlan(updated);
        setAddGoalForm({ open: false, problemId: '', title: '', category: 'CLINICAL', priority: 'ROUTINE', description: '', targetValue: '', targetDate: '' });
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleGoalStatusChange(goalId: string, status: GoalStatus) {
    const token = getToken();
    if (!token || !plan) return;
    const updated = await updateGoalStatus(token, plan.id, goalId, status);
    if (mountedRef.current) setPlan(updated);
  }

  async function handleDeleteGoal(goalId: string) {
    const token = getToken();
    if (!token || !plan) return;
    if (!window.confirm('Remove this goal and all its interventions?')) return;
    const updated = await deleteGoal(token, plan.id, goalId);
    if (mountedRef.current) setPlan(updated);
  }

  async function handleAddIntervention() {
    const token = getToken();
    if (!token || !plan || !addInterventionForm.title.trim()) return;
    setSaving(true);
    try {
      const updated = await addIntervention(token, plan.id, addInterventionForm.goalId, {
        title: addInterventionForm.title.trim(),
        description: addInterventionForm.description.trim() || undefined,
        frequency: addInterventionForm.frequency.trim() || undefined,
        responsible: addInterventionForm.responsible.trim() || undefined,
        assignedTo: addInterventionForm.assignedTo.trim() || undefined,
        dueDate: addInterventionForm.dueDate || undefined,
      });
      if (mountedRef.current) {
        setPlan(updated);
        setAddInterventionForm({ open: false, goalId: '', title: '', description: '', frequency: '', responsible: '', assignedTo: '', dueDate: '' });
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleInterventionStatusChange(interventionId: string, status: InterventionStatus) {
    const token = getToken();
    if (!token || !plan) return;
    // Find the intervention to get current data for the update
    for (const prob of plan.problems) {
      for (const goal of prob.goals) {
        const iv = goal.interventions.find((i) => i.id === interventionId);
        if (iv) {
          const updated = await updateIntervention(token, plan.id, interventionId, {
            title: iv.title,
            description: iv.description ?? undefined,
            frequency: iv.frequency ?? undefined,
            responsible: iv.responsible ?? undefined,
            status,
            assignedBy: iv.assignedBy ?? undefined,
            assignedTo: iv.assignedTo ?? undefined,
            dueDate: iv.dueDate ?? undefined,
            completedBy: iv.completedBy ?? undefined,
            completedDate: iv.completedDate ?? undefined,
          });
          if (mountedRef.current) setPlan(updated);
          return;
        }
      }
    }
  }

  async function handleDeleteIntervention(interventionId: string) {
    const token = getToken();
    if (!token || !plan) return;
    const updated = await deleteIntervention(token, plan.id, interventionId);
    if (mountedRef.current) setPlan(updated);
  }

  async function handleRecordProgress() {
    const token = getToken();
    if (!token || !plan || !progressNote.trim()) return;
    setSaving(true);
    try {
      const entry = await recordProgress(token, plan.id, {
        progressNote: progressNote.trim(),
        progressType,
        goalId: progressGoalId || undefined,
      });
      if (mountedRef.current) {
        setProgress((prev) => [entry, ...prev]);
        setProgressNote('');
        setProgressGoalId('');
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleCdseDecisions(decisions: CdseDecisionEntry[]) {
    const token = getToken();
    if (!token || !plan) return;
    setSaving(true);
    try {
      await recordCdseDecisions(token, plan.id, decisions);
      // Reload plan to pick up any newly created goals
      const updated = await fetchCarePlan(token, citizenId);
      // Reload suggestions to update decision history
      const updatedCdse = await fetchCdseSuggestions(token, plan.id);
      if (mountedRef.current) {
        setPlan(updated);
        setCdse(updatedCdse);
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  // ── Flatten all goals for dropdowns ───────────────────────────────────────
  const allGoals = plan?.problems.flatMap((p) => p.goals) ?? [];

  // ── Render: loading / error ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="cp-editor cp-editor--loading">
        <div className="cp-editor-spinner" />
        Loading care plan…
      </div>
    );
  }

  // ── Render: no plan yet ────────────────────────────────────────────────────
  if (!plan) {
    return (
      <div className="cp-editor cp-editor--empty">
        <div className="cp-editor-empty-icon">📋</div>
        <div className="cp-editor-empty-title">No Integrated Care Plan yet</div>
        <p className="cp-editor-empty-sub">
          Create an integrated longitudinal care plan to track problems, goals,
          and interventions across all programmes for this citizen.
        </p>
        {error && <p className="cp-error">{error}</p>}
        <div className="cp-create-row">
          <input
            className="fc"
            placeholder="Plan title (e.g. Integrated Care Plan – 2026)"
            value={newPlanTitle}
            onChange={(e) => setNewPlanTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreatePlan(); }}
            maxLength={200}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={handleCreatePlan}
            disabled={saving || !newPlanTitle.trim()}
          >
            {saving ? 'Creating…' : 'Create Care Plan'}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: full editor ────────────────────────────────────────────────────
  return (
    <div className="cp-editor">
      {/* ── Editor header ── */}
      <div className="cp-editor-head">
        <div className="cp-editor-head-left">
          <span className="cp-editor-title">{plan.title}</span>
          {citizenName && <span className="cp-editor-citizen">{citizenName}</span>}
        </div>
        <div className="cp-editor-head-right">
          <select
            className="cp-plan-status-sel"
            value={plan.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={saving}
          >
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
          {onClose && (
            <button type="button" className="cp-close-btn" onClick={onClose} aria-label="Close">×</button>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="cp-editor-tabs" role="tablist">
        {(['plan', 'progress', 'cdse'] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={activeTab === tab}
            className={`cp-editor-tab ${activeTab === tab ? 'cp-editor-tab--active' : ''}`}
            onClick={() => handleTabChange(tab)}
          >
            {tab === 'plan' && 'Care Plan'}
            {tab === 'progress' && 'Progress'}
            {tab === 'cdse' && 'CDSE Suggestions'}
          </button>
        ))}
      </div>

      {/* ── Tab: Plan ── */}
      {activeTab === 'plan' && (
        <div className="cp-editor-body">
          {plan.summary && <p className="cp-plan-summary">{plan.summary}</p>}

          {/* Problems */}
          {plan.problems.length === 0 && (
            <div className="cp-no-problems">
              No problems identified yet. Add the first health problem to get started.
            </div>
          )}

          {plan.problems.map((prob) => (
            <div key={prob.id} className={`cp-problem cp-problem--${prob.status.toLowerCase()}`}>
              <div className="cp-problem-header">
                <div className="cp-problem-header-left">
                  <span className={`cp-problem-status-dot cp-problem-dot--${prob.status.toLowerCase()}`} />
                  <span className="cp-problem-title">{prob.title}</span>
                  {prob.programName && (
                    <span className="cp-problem-program">{prob.programName}</span>
                  )}
                </div>
                <div className="cp-problem-header-right">
                  <button
                    type="button"
                    className="cp-add-goal-btn"
                    onClick={() => setAddGoalForm((f) => ({ ...f, open: true, problemId: prob.id }))}
                  >
                    + Goal
                  </button>
                  <button
                    type="button"
                    className="cp-del-btn"
                    onClick={() => handleDeleteProblem(prob.id)}
                    aria-label={`Remove problem: ${prob.title}`}
                  >
                    ×
                  </button>
                </div>
              </div>

              {prob.description && <p className="cp-problem-desc">{prob.description}</p>}

              {/* Goals within this problem */}
              {prob.goals.length === 0 && (
                <p className="cp-no-goals">No goals yet. Add a goal for this problem.</p>
              )}
              <div className="cp-goals-list">
                {prob.goals.map((goal) => (
                  <div key={goal.id}>
                    <GoalCard
                      goal={goal}
                      onStatusChange={handleGoalStatusChange}
                      onInterventionStatusChange={handleInterventionStatusChange}
                      onDeleteGoal={handleDeleteGoal}
                      onDeleteIntervention={handleDeleteIntervention}
                    />
                    <button
                      type="button"
                      className="cp-add-intervention-btn"
                      onClick={() => setAddInterventionForm((f) => ({ ...f, open: true, goalId: goal.id }))}
                    >
                      + Add Intervention
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Add problem button */}
          {!addProblemForm.open && (
            <button
              type="button"
              className="cp-add-problem-btn"
              onClick={() => setAddProblemForm((f) => ({ ...f, open: true }))}
            >
              + Add Health Problem
            </button>
          )}

          {/* Add problem form */}
          {addProblemForm.open && (
            <div className="cp-inline-form">
              <div className="cp-inline-form-title">New Health Problem</div>
              <input
                className="fc"
                placeholder="Problem title (e.g. Uncontrolled Hypertension)"
                value={addProblemForm.title}
                onChange={(e) => setAddProblemForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={200}
                autoFocus
              />
              <textarea
                className="fc"
                rows={2}
                placeholder="Description (optional)"
                value={addProblemForm.description}
                onChange={(e) => setAddProblemForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={1000}
              />
              <div className="cp-form-row">
                <div className="fg">
                  <label className="fl">Identified Date</label>
                  <input
                    type="date"
                    className="fc"
                    value={addProblemForm.identifiedDate}
                    onChange={(e) => setAddProblemForm((f) => ({ ...f, identifiedDate: e.target.value }))}
                  />
                </div>
                <div className="fg">
                  <label className="fl">Status</label>
                  <select
                    className="fc"
                    value={addProblemForm.status}
                    onChange={(e) => setAddProblemForm((f) => ({ ...f, status: e.target.value as ProblemStatus }))}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="MONITORING">Monitoring</option>
                    <option value="DEFERRED">Deferred</option>
                  </select>
                </div>
              </div>
              <div className="cp-form-actions">
                <button type="button" className="btn-outline" onClick={() => setAddProblemForm((f) => ({ ...f, open: false }))}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleAddProblem} disabled={saving || !addProblemForm.title.trim()}>
                  {saving ? 'Adding…' : 'Add Problem'}
                </button>
              </div>
            </div>
          )}

          {/* Add goal form */}
          {addGoalForm.open && (
            <div className="cp-inline-form cp-inline-form--overlay">
              <div className="cp-inline-form-title">New Goal</div>
              <input
                className="fc"
                placeholder="Goal title"
                value={addGoalForm.title}
                onChange={(e) => setAddGoalForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={200}
                autoFocus
              />
              <textarea
                className="fc"
                rows={2}
                placeholder="Description (optional)"
                value={addGoalForm.description}
                onChange={(e) => setAddGoalForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={1000}
              />
              <div className="cp-form-row">
                <div className="fg">
                  <label className="fl">Category</label>
                  <select className="fc" value={addGoalForm.category} onChange={(e) => setAddGoalForm((f) => ({ ...f, category: e.target.value as GoalCategory }))}>
                    <option value="CLINICAL">Clinical</option>
                    <option value="LIFESTYLE">Lifestyle</option>
                    <option value="MEDICATION">Medication</option>
                    <option value="EDUCATION">Education</option>
                    <option value="REFERRAL">Referral</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Priority</label>
                  <select className="fc" value={addGoalForm.priority} onChange={(e) => setAddGoalForm((f) => ({ ...f, priority: e.target.value as GoalPriority }))}>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="ROUTINE">Routine</option>
                  </select>
                </div>
              </div>
              <div className="cp-form-row">
                <div className="fg">
                  <label className="fl">Target Value</label>
                  <input className="fc" placeholder="e.g. &lt; 130/80 mmHg" value={addGoalForm.targetValue} onChange={(e) => setAddGoalForm((f) => ({ ...f, targetValue: e.target.value }))} maxLength={200} />
                </div>
                <div className="fg">
                  <label className="fl">Target Date</label>
                  <input type="date" className="fc" value={addGoalForm.targetDate} onChange={(e) => setAddGoalForm((f) => ({ ...f, targetDate: e.target.value }))} />
                </div>
              </div>
              <div className="cp-form-actions">
                <button type="button" className="btn-outline" onClick={() => setAddGoalForm((f) => ({ ...f, open: false }))}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleAddGoal} disabled={saving || !addGoalForm.title.trim()}>
                  {saving ? 'Adding…' : 'Add Goal'}
                </button>
              </div>
            </div>
          )}

          {/* Add intervention form */}
          {addInterventionForm.open && (
            <div className="cp-inline-form cp-inline-form--overlay">
              <div className="cp-inline-form-title">New Intervention</div>
              <input
                className="fc"
                placeholder="Intervention title"
                value={addInterventionForm.title}
                onChange={(e) => setAddInterventionForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={200}
                autoFocus
              />
              <textarea
                className="fc"
                rows={2}
                placeholder="Description (optional)"
                value={addInterventionForm.description}
                onChange={(e) => setAddInterventionForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={1000}
              />
              <div className="cp-form-row">
                <div className="fg">
                  <label className="fl">Frequency</label>
                  <input className="fc" placeholder="e.g. Monthly" value={addInterventionForm.frequency} onChange={(e) => setAddInterventionForm((f) => ({ ...f, frequency: e.target.value }))} maxLength={100} />
                </div>
                <div className="fg">
                  <label className="fl">Responsible Role</label>
                  <select className="fc" value={addInterventionForm.responsible} onChange={(e) => setAddInterventionForm((f) => ({ ...f, responsible: e.target.value }))}>
                    <option value="">Select role</option>
                    <option value="CARE_ASSISTANT">Care Assistant</option>
                    <option value="CLINICIAN">Clinician</option>
                    <option value="ANM">ANM</option>
                  </select>
                </div>
              </div>
              <div className="cp-form-row">
                <div className="fg">
                  <label className="fl">Assigned To</label>
                  <input className="fc" placeholder="Username or name" value={addInterventionForm.assignedTo} onChange={(e) => setAddInterventionForm((f) => ({ ...f, assignedTo: e.target.value }))} maxLength={100} />
                </div>
                <div className="fg">
                  <label className="fl">Due Date</label>
                  <input type="date" className="fc" value={addInterventionForm.dueDate} onChange={(e) => setAddInterventionForm((f) => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
              <div className="cp-form-actions">
                <button type="button" className="btn-outline" onClick={() => setAddInterventionForm((f) => ({ ...f, open: false }))}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleAddIntervention} disabled={saving || !addInterventionForm.title.trim()}>
                  {saving ? 'Adding…' : 'Add Intervention'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Progress ── */}
      {activeTab === 'progress' && (
        <div className="cp-editor-body">
          <div className="cp-progress-quick-entry">
            <div className="cp-form-row">
              <div className="fg" style={{ flex: 2 }}>
                <label className="fl">Progress Note</label>
                <textarea
                  className="fc"
                  rows={3}
                  placeholder="Describe what was observed, discussed, or achieved…"
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                  maxLength={4000}
                />
              </div>
            </div>
            <div className="cp-form-row">
              <div className="fg">
                <label className="fl">Type</label>
                <select className="fc" value={progressType} onChange={(e) => setProgressType(e.target.value as ProgressType)}>
                  <option value="UPDATE">Update</option>
                  <option value="ASSESSMENT">Assessment</option>
                  <option value="REVIEW">Review</option>
                  <option value="ACHIEVEMENT">Achievement</option>
                  <option value="ESCALATION">Escalation (Clinician only)</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Linked Goal (optional)</label>
                <select className="fc" value={progressGoalId} onChange={(e) => setProgressGoalId(e.target.value)}>
                  <option value="">General progress</option>
                  {allGoals.map((g) => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={handleRecordProgress}
              disabled={saving || !progressNote.trim()}
            >
              {saving ? 'Saving…' : 'Record Progress'}
            </button>
          </div>

          <ProgressTimeline entries={progress} />
        </div>
      )}

      {/* ── Tab: CDSE Suggestions ── */}
      {activeTab === 'cdse' && (
        <div className="cp-editor-body">
          {!cdseLoaded && <div className="cp-editor-spinner" />}
          {cdseLoaded && cdse && (
            <CdseGoalSuggestions
              suggestions={cdse}
              onSubmit={handleCdseDecisions}
              onClose={() => setActiveTab('plan')}
              saving={saving}
            />
          )}
        </div>
      )}

      {plan.lastReviewedAt && (
        <div className="cp-editor-foot">
          Last reviewed {new Date(plan.lastReviewedAt).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
          })}
          {plan.lastReviewedBy && ` by ${plan.lastReviewedBy}`}
        </div>
      )}
    </div>
  );
}
