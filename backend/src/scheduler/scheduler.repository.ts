import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DueActivityRow, SchedulerRunDto, SchedulerTrigger } from './scheduler.types';

interface RunRow {
  id: string;
  started_at: Date;
  finished_at: Date | null;
  trigger: string;
  due_found: number;
  rules_processed: number;
  activities_created: number;
  retries: number;
  escalations: number;
  failures: number;
  error: string | null;
}

/**
 * Data-access layer for the Scheduler. The ONLY place holding scheduler SQL.
 *
 * Owns the lightweight `scheduler_runs` log table (created idempotently on
 * startup) and the read of "due work". It does NOT contain workflow or retry
 * logic — it only selects overdue pending activities for the engine to process.
 */
@Injectable()
export class SchedulerRepository implements OnModuleInit {
  private readonly logger = new Logger(SchedulerRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.db.query(
        `CREATE TABLE IF NOT EXISTS public.scheduler_runs (
           id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
           started_at timestamp with time zone DEFAULT now() NOT NULL,
           finished_at timestamp with time zone,
           trigger character varying(10) DEFAULT 'AUTO' NOT NULL,
           due_found integer DEFAULT 0 NOT NULL,
           rules_processed integer DEFAULT 0 NOT NULL,
           activities_created integer DEFAULT 0 NOT NULL,
           retries integer DEFAULT 0 NOT NULL,
           escalations integer DEFAULT 0 NOT NULL,
           failures integer DEFAULT 0 NOT NULL,
           error text
         )`,
      );
      await this.db.query(
        `CREATE INDEX IF NOT EXISTS idx_scheduler_runs_started
           ON public.scheduler_runs (started_at DESC)`,
      );
    } catch (error) {
      this.logger.error(`scheduler_runs ensure failed: ${(error as Error).message}`);
    }
  }

  /**
   * Due work: overdue (due_date < today) PENDING activities still linked to an
   * enrollment. Only the minimal columns the engine needs are loaded, ordered by
   * due date and capped at `limit` so a cycle never loads the whole table.
   */
  async findDueActivities(limit: number): Promise<DueActivityRow[]> {
    const result = await this.db.query<DueActivityRow>(
      `SELECT w.id AS activity_id,
              w.enrollment_id AS enrollment_id,
              COALESCE(w.program_id, e.program_id) AS program_id,
              COALESCE(w.disease_id, e.disease_id) AS disease_id,
              w.event_id AS event_id
       FROM public.worklist_items w
       JOIN public.enrollments e ON e.id = w.enrollment_id
       WHERE w.status = 'PENDING'
         AND w.event_id IS NOT NULL
         AND w.due_date < CURRENT_DATE
       ORDER BY w.due_date ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /**
   * Resolves the "no response" system outcome for an event (a missed/overdue
   * follow-up). Prefers the NO_RESPONSE code, falling back to any NEGATIVE
   * outcome. Returns null when the event has no such outcome configured.
   */
  async findNoResponseOutcome(
    eventId: string,
  ): Promise<{ id: string; category: string } | null> {
    const result = await this.db.query<{ id: string; category: string }>(
      `SELECT id, category FROM public.outcome_types
       WHERE event_id = $1 AND (code = 'NO_RESPONSE' OR category = 'NEGATIVE')
       ORDER BY (code = 'NO_RESPONSE') DESC, (category = 'NEGATIVE') DESC
       LIMIT 1`,
      [eventId],
    );
    return result.rows[0] ?? null;
  }

  /** Persists a completed run and returns it. */
  async insertRun(run: Omit<SchedulerRunDto, 'id'>): Promise<SchedulerRunDto> {
    const result = await this.db.query<RunRow>(
      `INSERT INTO public.scheduler_runs
         (started_at, finished_at, trigger, due_found, rules_processed,
          activities_created, retries, escalations, failures, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        run.startedAt,
        run.finishedAt,
        run.trigger,
        run.dueFound,
        run.rulesProcessed,
        run.activitiesCreated,
        run.retries,
        run.escalations,
        run.failures,
        run.error,
      ],
    );
    return SchedulerRepository.toDto(result.rows[0]);
  }

  async recentRuns(limit: number): Promise<SchedulerRunDto[]> {
    const result = await this.db.query<RunRow>(
      `SELECT * FROM public.scheduler_runs ORDER BY started_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map(SchedulerRepository.toDto);
  }

  async totals(): Promise<{
    runs: number;
    activitiesCreated: number;
    retries: number;
    escalations: number;
    failures: number;
  }> {
    const result = await this.db.query<{
      runs: number;
      activities_created: number;
      retries: number;
      escalations: number;
      failures: number;
    }>(
      `SELECT count(*)::int AS runs,
              COALESCE(sum(activities_created),0)::int AS activities_created,
              COALESCE(sum(retries),0)::int AS retries,
              COALESCE(sum(escalations),0)::int AS escalations,
              COALESCE(sum(failures),0)::int AS failures
       FROM public.scheduler_runs`,
    );
    const row = result.rows[0];
    return {
      runs: row?.runs ?? 0,
      activitiesCreated: row?.activities_created ?? 0,
      retries: row?.retries ?? 0,
      escalations: row?.escalations ?? 0,
      failures: row?.failures ?? 0,
    };
  }

  private static toDto(row: RunRow): SchedulerRunDto {
    return {
      id: row.id,
      startedAt: row.started_at.toISOString(),
      finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
      trigger: row.trigger as SchedulerTrigger,
      dueFound: row.due_found,
      rulesProcessed: row.rules_processed,
      activitiesCreated: row.activities_created,
      retries: row.retries,
      escalations: row.escalations,
      failures: row.failures,
      error: row.error,
    };
  }
}
