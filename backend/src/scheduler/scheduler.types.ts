/**
 * Types for the Scheduler & Automation Engine (Step 6B — metadata-driven).
 *
 * The Scheduler is the metadata-driven schedule engine: each cycle it reads the
 * effective schedule rules (dinc_metadata.v_schedule_rule_effective) and
 * materialises the runtime consequences — event_instance / activity_instance
 * rows and overdue follow-up tasks — then records a lightweight run log.
 *
 * Run-counter mapping (the SchedulerRunDto column names predate Step 6B and are
 * kept so the Administration UI and scheduler_runs table stay unchanged):
 *   dueFound          → overdue ACTIVE event instances found this cycle
 *   rulesProcessed    → effective schedule rules evaluated this cycle
 *   activitiesCreated → event instances seeded (occurrence 1) this cycle
 *   retries           → recurring occurrences (occurrence > 1) created
 *   escalations       → follow-up tasks (+ system call logs) generated
 */

export type SchedulerTrigger = 'AUTO' | 'MANUAL';

/** One recorded scheduler run (mirrors the scheduler_runs row). */
export interface SchedulerRunDto {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: SchedulerTrigger;
  dueFound: number;
  rulesProcessed: number;
  activitiesCreated: number;
  retries: number;
  escalations: number;
  failures: number;
  error: string | null;
}

/** Status payload for the Administration → Scheduler page. */
export interface SchedulerStatusDto {
  enabled: boolean;
  intervalMs: number;
  lastRun: SchedulerRunDto | null;
  nextRunEstimate: string | null;
  recentRuns: SchedulerRunDto[];
  totals: {
    runs: number;
    activitiesCreated: number;
    retries: number;
    escalations: number;
    failures: number;
  };
}

/** Result of one metadata-driven sweep (all inside a single transaction). */
export interface SweepResult {
  /** Effective schedule rules evaluated against ACTIVE enrolments. */
  rulesEvaluated: number;
  /** Occurrence-1 event instances created from rules (seeded). */
  seeded: SweepCreatedEvent[];
  /** Occurrence>1 recurring event instances created (stream continuation). */
  recurring: SweepCreatedEvent[];
  /** Overdue ACTIVE event instances found (due_date < today). */
  overdueFound: number;
  /** Follow-up tasks generated for overdue events (with system call logs). */
  followupsCreated: number;
}

/** One event_instance the sweep created (for logging/response payloads). */
export interface SweepCreatedEvent {
  eventInstanceId: string;
  eventCode: string;
  occurrence: number;
  dueDate: string;
  conditionContext: string | null;
}
