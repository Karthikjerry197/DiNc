/**
 * Types for the Scheduler & Automation Engine.
 *
 * The Scheduler decides WHEN work runs; it does NOT decide WHAT happens — that
 * remains the Workflow Rules Engine's job. Each cycle finds due (overdue, pending)
 * activities and drives them through the existing engine, then records a
 * lightweight run log.
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

/** A unit of due work the scheduler feeds to the engine. */
export interface DueActivityRow {
  activity_id: string;
  enrollment_id: string;
  program_id: string | null;
  disease_id: string | null;
  event_id: string;
}
