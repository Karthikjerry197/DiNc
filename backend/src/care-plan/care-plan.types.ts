/**
 * Longitudinal Care Plan Engine — shared types.
 *
 * One integrated care plan per citizen, structured as:
 *   CarePlan → Problems → Goals → Interventions
 * Progress records link consultations to specific goals over time.
 */

// ── Status / category enums ───────────────────────────────────────────────────

export type CarePlanStatus     = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'SUSPENDED';
export type ProblemStatus      = 'ACTIVE' | 'RESOLVED' | 'MONITORING' | 'DEFERRED';
export type GoalCategory       = 'CLINICAL' | 'LIFESTYLE' | 'MEDICATION' | 'EDUCATION' | 'REFERRAL';
export type GoalStatus         = 'ACTIVE' | 'ACHIEVED' | 'PARTIAL' | 'NOT_ACHIEVED' | 'DEFERRED';
export type GoalPriority       = 'CRITICAL' | 'HIGH' | 'ROUTINE';
export type InterventionStatus = 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'DISCONTINUED';
export type ProgressType       = 'ASSESSMENT' | 'UPDATE' | 'REVIEW' | 'ESCALATION' | 'ACHIEVEMENT';
export type CdseDecision       = 'ACCEPTED' | 'DECLINED';

// ── Intervention ──────────────────────────────────────────────────────────────

export interface CarePlanInterventionDto {
  id: string;
  goalId: string;
  carePlanId: string;
  title: string;
  description: string | null;
  frequency: string | null;
  responsible: string | null;
  status: InterventionStatus;
  assignedBy: string | null;
  assignedTo: string | null;
  dueDate: string | null;       // ISO date YYYY-MM-DD
  completedBy: string | null;
  completedDate: string | null; // ISO date YYYY-MM-DD
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Goal ──────────────────────────────────────────────────────────────────────

export interface CarePlanGoalDto {
  id: string;
  problemId: string;
  carePlanId: string;
  title: string;
  description: string | null;
  targetValue: string | null;
  targetDate: string | null; // ISO date YYYY-MM-DD
  category: GoalCategory;
  status: GoalStatus;
  priority: GoalPriority;
  cdseRuleId: string | null;
  sortOrder: number;
  interventions: CarePlanInterventionDto[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Problem ───────────────────────────────────────────────────────────────────

export interface CarePlanProblemDto {
  id: string;
  carePlanId: string;
  enrollmentId: string | null;   // optional link for programme context
  programId: string | null;
  programName: string | null;    // joined from programmes
  title: string;
  description: string | null;
  identifiedDate: string | null; // ISO date YYYY-MM-DD
  status: ProblemStatus;
  sortOrder: number;
  goals: CarePlanGoalDto[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Care Plan (full) ──────────────────────────────────────────────────────────

export interface CarePlanDto {
  id: string;
  citizenId: string;
  citizenName: string | null;
  status: CarePlanStatus;
  title: string;
  summary: string | null;
  createdBy: string;
  lastReviewedBy: string | null;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  problems: CarePlanProblemDto[];
}

// ── Care Plan (summary — no problem tree) ────────────────────────────────────

export interface CarePlanSummaryDto {
  id: string;
  citizenId: string;
  status: CarePlanStatus;
  title: string;
  summary: string | null;
  totalProblems: number;
  activeProblems: number;
  activeGoals: number;
  achievedGoals: number;
  lastReviewedAt: string | null;
  updatedAt: string;
}

// ── Progress record ───────────────────────────────────────────────────────────

export interface CarePlanProgressDto {
  id: string;
  carePlanId: string;
  goalId: string | null;
  goalTitle: string | null;
  problemTitle: string | null;
  worklistItemId: string | null;
  outcomeRecordId: string | null;
  progressNote: string;
  progressType: ProgressType;
  recordedBy: string;
  recordedAt: string;
}

// ── CDSE integration ──────────────────────────────────────────────────────────

/** One CDSE recommendation enriched with care-plan decision history. */
export interface CdseGoalSuggestionDto {
  cdseRuleId: string;
  title: string;
  description: string;
  targetValue: string | null;
  category: GoalCategory;
  priority: GoalPriority;
  cdsePriority: string;          // original CDSE priority label passthrough
  alreadyAccepted: boolean;      // a goal with this cdse_rule_id already exists
  lastDecision: CdseDecision | null;
  lastDeclineReason: string | null;
}

/** One decision (accept / decline) for a single CDSE recommendation. */
export interface CdseDecisionEntryDto {
  cdseRuleId: string;
  recommendationTitle: string;
  decision: CdseDecision;
  declineReason?: string;  // only meaningful when decision = DECLINED
  problemId?: string;      // for ACCEPTED: which problem to add the created goal to
}

/** Result returned after recording a batch of CDSE decisions. */
export interface CdseDecisionResultDto {
  recorded: number;
  goalsCreated: CarePlanGoalDto[];
}
