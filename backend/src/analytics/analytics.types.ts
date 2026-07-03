/**
 * Types for the Analytics Foundation.
 *
 * Every figure is produced by SQL aggregation over the EXISTING operational
 * tables — nothing is hardcoded. Metrics with no data source yet (e.g. knowledge
 * view counts) are surfaced as null so the UI can render a "not yet tracked"
 * state, keeping the architecture forward-compatible.
 */

/** Shared, reusable filter set. Unset fields are ignored by every query. */
export interface AnalyticsFilters {
  from: string | null; // ISO date (inclusive)
  to: string | null; // ISO date (inclusive)
  programId: string | null;
  diseaseId: string | null;
  district: string | null;
  /** Worker scope (assigned_to / assigned_worker). Forced for non-admins. */
  assignedTo: string | null;
}

export interface ExecutiveSummaryDto {
  totalPatients: number | null;
  todaysRegistrations: number | null;
  activeEnrollments: number | null;
  pendingActivities: number | null;
  completedActivities: number | null;
  overdueActivities: number | null;
  escalatedCases: number | null;
  duplicateRequests: number | null;
  schedulerRunsToday: number | null;
  workflowSuccessRate: number | null; // %
  completionRate: number | null; // %
  averageResponseHours: number | null;
}

export interface ProgramAnalyticsRow {
  programId: string;
  program: string;
  registeredPatients: number;
  activeEnrollments: number;
  completedActivities: number;
  pendingActivities: number;
  overdueActivities: number;
  completionRate: number; // %
}

export interface WorklistAnalyticsDto {
  pending: number;
  completed: number;
  overdue: number;
  escalated: number;
  totalRetries: number;
  averageCompletionHours: number | null;
  createdToday: number;
  completedToday: number;
  createdThisWeek: number;
}

export interface WorkerPerformanceRow {
  username: string;
  fullName: string;
  role: string;
  assigned: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number; // %
  averageResponseHours: number | null;
  escalations: number;
  retries: number;
}

export interface NameCount {
  name: string;
  count: number;
}

export interface RegistrationAnalyticsDto {
  today: number;
  thisWeek: number;
  thisMonth: number;
  byProgram: NameCount[];
  byWorker: NameCount[];
  duplicatesPrevented: number | null;
  /** Bulk vs single source is not tracked on citizens; reserved for future. */
  bulkUploads: number | null;
}

export interface KnowledgeItemStat {
  id: string;
  title: string;
  category: string | null;
  views: number | null; // null = view tracking not yet implemented
}

export interface KnowledgeAnalyticsDto {
  totals: { guidebooks: number; faqs: number; training: number; emergency: number };
  topGuidebooks: KnowledgeItemStat[];
  topFaqs: KnowledgeItemStat[];
  topTraining: KnowledgeItemStat[];
  topEmergency: KnowledgeItemStat[];
  tracking: boolean; // false until usage tracking ships
}

export interface SchedulerAnalyticsDto {
  totalRuns: number;
  activitiesGenerated: number;
  retries: number;
  escalations: number;
  failures: number;
  averageRuntimeMs: number | null;
  successRate: number | null; // %
  runsToday: number;
}

export interface WorkflowAnalyticsDto {
  mostTriggeredOutcomes: NameCount[];
  mostCommonOutcomes: NameCount[];
  retrySuccessRate: number | null; // %
  escalationRate: number | null; // %
  averageDelayDays: number | null;
  rulesExecutedToday: number;
}

/** A point for time-series charts. */
export interface SeriesPoint {
  label: string;
  value: number;
}

/** One day of the clinical-risk trend (alerts triggered that day, by level). */
export interface RiskTrendPoint {
  date: string; // YYYY-MM-DD
  moderate: number;
  severe: number;
}

/**
 * Clinical Risk analytics (M34). NO new risk logic: severe/moderate count
 * citizens with ACTIVE clinical_alerts the CDSE already writes (each citizen
 * once, at their severest level, exactly like the M32 Dashboard breakdown);
 * low mirrors CdseService.getLatestRisk's fallback (has a recorded
 * consultation, no active alert).
 */
export interface RiskAnalyticsDto {
  low: number;
  moderate: number;
  severe: number;
  activeAlerts: number;
  resolvedAlerts: number;
  trend: RiskTrendPoint[]; // last 30 days, oldest first
  distribution: NameCount[]; // Active vs Resolved alert counts
}

/** Per-disease patient analytics (M34), aggregated over existing enrollments. */
export interface DiseaseAnalyticsRow {
  diseaseId: string;
  disease: string;
  totalPatients: number;
  activePatients: number;
  completedPatients: number;
  /** Citizens with an ACTIVE SEVERE clinical alert for this disease (M32 semantics). */
  highRiskPatients: number;
}

/**
 * Aggregated snapshot for the Operations Dashboard — what supervisors and
 * medical officers need to understand today's care load at a glance.
 * All figures come from existing tables; nothing is stored or duplicated.
 * Programs and workers are embedded so the frontend needs one round-trip.
 */
export interface OperationsDashboardDto {
  // ── Today's Work ──────────────────────────────────────────────────────
  dueToday: number;
  overdueActivities: number;
  highPriorityActivities: number;
  escalatedActivities: number;
  // ── Population Summary ────────────────────────────────────────────────
  totalCitizens: number;
  activeEnrollments: number;
  newRegistrationsToday: number;
  // ── Consultation Summary ──────────────────────────────────────────────
  consultationsCompletedToday: number;
  consultationsPending: number;
  referralsToday: number;
  // ── Per-Programme and Per-Worker breakdown (reused from existing) ─────
  programs: ProgramAnalyticsRow[];
  workers: WorkerPerformanceRow[];
}
