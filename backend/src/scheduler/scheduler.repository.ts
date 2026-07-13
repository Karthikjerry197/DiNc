import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, TxClient } from '../database/database.service';
import {
  SchedulerRunDto,
  SweepCreatedEvent,
  SweepResult,
} from './scheduler.types';

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

interface CreatedEventRow {
  id: string;
  event_code: string;
  occurrence_number: number;
  due_date: Date;
  condition_context: string | null;
}

/**
 * Data-access layer for the metadata-driven Scheduler Engine (Step 6B).
 * The ONLY place holding scheduler SQL.
 *
 * Every cycle runs ONE sweep inside ONE transaction (DatabaseService.
 * withTransaction — full rollback on any failure) with three set-based phases:
 *
 *  1. SEED — instantiate occurrence 1 of every event whose effective schedule
 *     rule (dinc_metadata.v_schedule_rule_effective) is now satisfied for an
 *     ACTIVE enrolment:
 *       • context resolution: the OVERRIDE row (condition_context, e.g.
 *         HIGH_RISK) wins over the BASE row when the enrolment has a matching
 *         uncleared patient_condition; the chosen context is stamped on
 *         event_instance.condition_context.
 *       • existence gate: NULL always passes; HIGH_RISK requires the uncleared
 *         flag; FEMALE_ONLY requires patient.sex = 'FEMALE'. IF_INITIATED /
 *         IF_INDICATED / ON_REFERRAL are clinician-initiated and never
 *         auto-seeded (their recurring streams ARE continued in phase 2 once
 *         occurrence 1 exists).
 *       • anchor: PROGRAMME_REGISTRATION → registration_date; BIRTH_DATE →
 *         patient.birth_date (skipped while NULL); PREVIOUS_EVENT_COMPLETION →
 *         latest completed_at of the dependency event. due = anchor + offset.
 *       • dependency gate: dependency_event_code (start gate) must have a
 *         COMPLETED instance on the enrolment.
 *  2. RECUR — for RECURRING rules whose latest occurrence is COMPLETED and the
 *     stream is not exhausted (repeat_count) nor terminated
 *     (repeat_until_event_code completed), create occurrence n+1 with
 *     due = anchor + offset + n · repeat_interval_days.
 *  3. FOLLOW-UP — for every overdue ACTIVE event_instance without a previous
 *     system-generated follow-up, insert a system call_log (outcome 'NIL' — no
 *     response) and a followup_task whose due date / priority come from
 *     dinc_metadata.v_call_outcome_rule_resolved for the enrolment's programme.
 *
 * Duplicate prevention is structural: uq_ei_occurrence (enrolment_id, event_id,
 * occurrence_number) plus NOT EXISTS guards; re-running a sweep is a no-op.
 * dinc_metadata is only ever SELECTed. All statements are parameterised.
 */
@Injectable()
export class SchedulerRepository implements OnModuleInit {
  private readonly logger = new Logger(SchedulerRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.db.query(
        `CREATE TABLE IF NOT EXISTS dinc_app.scheduler_runs (
           id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
           ON dinc_app.scheduler_runs (started_at DESC)`,
      );
    } catch (error) {
      this.logger.error(`scheduler_runs ensure failed: ${(error as Error).message}`);
    }
  }

  // ── The metadata-driven sweep (Step 6B core) ───────────────────────────────

  /** Runs one full sweep in a single transaction and reports what it did. */
  async runSweep(): Promise<SweepResult> {
    return this.db.withTransaction(async (tx) => {
      const rulesEvaluated = await SchedulerRepository.countRules(tx);
      const seeded = await SchedulerRepository.seedEligibleEvents(tx);
      const recurring = await SchedulerRepository.advanceRecurringStreams(tx);
      const createdIds = [...seeded, ...recurring].map((e) => e.eventInstanceId);
      if (createdIds.length > 0) {
        await SchedulerRepository.createActivityInstances(tx, createdIds);
      }
      const { overdueFound, followupsCreated } =
        await SchedulerRepository.generateFollowups(tx);
      return { rulesEvaluated, seeded, recurring, overdueFound, followupsCreated };
    });
  }

  /** Effective rules applicable to ACTIVE enrolments (for the run log only). */
  private static async countRules(tx: TxClient): Promise<number> {
    const res = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n
       FROM dinc_runtime.programme_enrolment pe
       JOIN dinc_metadata.event e ON e.programme_id = pe.programme_id
       JOIN dinc_metadata.v_schedule_rule_effective v ON v.event_id = e.event_id
       WHERE pe.status = 'ACTIVE'`,
    );
    return res.rows[0]?.n ?? 0;
  }

  /**
   * Phase 1 — SEED occurrence 1 of every rule now satisfied.
   *
   * `eligible` resolves, per (enrolment, event), the effective rule row:
   * DISTINCT ON keeps the OVERRIDE (condition_context matched by an uncleared
   * patient_condition) ahead of the BASE row. Anchors, existence conditions and
   * dependency gates are evaluated in SQL against runtime state; the INSERT is
   * guarded by NOT EXISTS on (enrolment, event) so occurrence 1 is only ever
   * created once, whatever earlier step created it.
   */
  private static async seedEligibleEvents(tx: TxClient): Promise<SweepCreatedEvent[]> {
    const res = await tx.query<CreatedEventRow>(
      `WITH eligible AS (
         SELECT DISTINCT ON (pe.enrolment_id, v.event_id)
                pe.enrolment_id,
                v.event_id,
                v.event_code,
                v.condition_context,
                (CASE v.anchor_type
                   WHEN 'PROGRAMME_REGISTRATION' THEN pe.registration_date
                   WHEN 'BIRTH_DATE'             THEN p.birth_date
                   WHEN 'PREVIOUS_EVENT_COMPLETION' THEN dep.completed_date
                 END) + COALESCE(v.offset_days, 0) AS due_date
         FROM dinc_runtime.programme_enrolment pe
         JOIN dinc_runtime.patient p ON p.patient_id = pe.patient_id
         JOIN dinc_metadata.event e ON e.programme_id = pe.programme_id
         JOIN dinc_metadata.v_schedule_rule_effective v ON v.event_id = e.event_id
         LEFT JOIN LATERAL (
           SELECT max(x.completed_at)::date AS completed_date
           FROM dinc_runtime.event_instance x
           JOIN dinc_metadata.event de ON de.event_id = x.event_id
           WHERE x.enrolment_id = pe.enrolment_id
             AND de.event_code = v.dependency_event_code
             AND x.status = 'COMPLETED'
         ) dep ON v.dependency_event_code IS NOT NULL
         WHERE pe.status = 'ACTIVE'
           -- context resolution: OVERRIDE only when the flag is live
           AND (v.condition_context IS NULL OR EXISTS (
                 SELECT 1 FROM dinc_runtime.patient_condition pc
                 WHERE pc.enrolment_id = pe.enrolment_id
                   AND pc.condition_code = v.condition_context
                   AND pc.cleared_at IS NULL))
           -- existence gate (auto-evaluable conditions only)
           AND (v.existence_condition IS NULL
                OR (v.existence_condition = 'HIGH_RISK' AND EXISTS (
                      SELECT 1 FROM dinc_runtime.patient_condition pc
                      WHERE pc.enrolment_id = pe.enrolment_id
                        AND pc.condition_code = 'HIGH_RISK'
                        AND pc.cleared_at IS NULL))
                OR (v.existence_condition = 'FEMALE_ONLY' AND p.sex = 'FEMALE'))
           -- dependency start-gate satisfied
           AND (v.dependency_event_code IS NULL OR dep.completed_date IS NOT NULL)
           -- anchor date resolvable (BIRTH_DATE waits for a known birth_date)
           AND (v.anchor_type <> 'BIRTH_DATE' OR p.birth_date IS NOT NULL)
           -- occurrence 1 not yet instantiated by any path
           AND NOT EXISTS (
                 SELECT 1 FROM dinc_runtime.event_instance x
                 WHERE x.enrolment_id = pe.enrolment_id AND x.event_id = v.event_id)
         ORDER BY pe.enrolment_id, v.event_id,
                  (v.condition_context IS NOT NULL) DESC
       )
       INSERT INTO dinc_runtime.event_instance
         (enrolment_id, event_id, occurrence_number, status, due_date,
          condition_context, activated_at, assigned_to, priority, metadata_release_id)
       SELECT el.enrolment_id, el.event_id, 1, 'ACTIVE', el.due_date,
              el.condition_context, now(), latest.assigned_to, 'NORMAL',
              (SELECT release_version FROM dinc_metadata.metadata_release
               ORDER BY loaded_at DESC LIMIT 1)
       FROM eligible el
       LEFT JOIN LATERAL (
         SELECT x.assigned_to FROM dinc_runtime.event_instance x
         WHERE x.enrolment_id = el.enrolment_id AND x.assigned_to IS NOT NULL
         ORDER BY x.created_at DESC LIMIT 1
       ) latest ON true
       ON CONFLICT ON CONSTRAINT uq_ei_occurrence DO NOTHING
       RETURNING event_instance_id AS id,
                 (SELECT event_code FROM dinc_metadata.event e2
                  WHERE e2.event_id = event_instance.event_id) AS event_code,
                 occurrence_number, due_date, condition_context`,
    );
    return res.rows.map(SchedulerRepository.toCreated);
  }

  /**
   * Phase 2 — continue RECURRING streams: when the latest occurrence of a
   * recurring event is COMPLETED and the stream is neither exhausted
   * (repeat_count) nor terminated (repeat_until_event_code has a COMPLETED
   * instance), create occurrence n+1. Applies to every stream that exists —
   * including clinician-initiated (IF_INITIATED/IF_INDICATED) ones, whose
   * occurrence 1 was created manually. due(n+1) = anchor + offset + n · interval.
   */
  private static async advanceRecurringStreams(tx: TxClient): Promise<SweepCreatedEvent[]> {
    const res = await tx.query<CreatedEventRow>(
      `WITH streams AS (
         SELECT DISTINCT ON (ei.enrolment_id, ei.event_id)
                ei.enrolment_id,
                ei.event_id,
                ei.occurrence_number AS last_occurrence,
                ei.status            AS last_status,
                ei.assigned_to,
                ei.condition_context AS last_context
         FROM dinc_runtime.event_instance ei
         ORDER BY ei.enrolment_id, ei.event_id, ei.occurrence_number DESC
       ),
       nextocc AS (
         SELECT DISTINCT ON (s.enrolment_id, s.event_id)
                s.enrolment_id,
                s.event_id,
                v.event_code,
                s.last_occurrence + 1 AS occurrence_number,
                s.assigned_to,
                v.condition_context,
                (CASE v.anchor_type
                   WHEN 'PROGRAMME_REGISTRATION' THEN pe.registration_date
                   WHEN 'BIRTH_DATE'             THEN p.birth_date
                   WHEN 'PREVIOUS_EVENT_COMPLETION' THEN dep.completed_date
                 END)
                + COALESCE(v.offset_days, 0)
                + s.last_occurrence * v.repeat_interval_days AS due_date
         FROM streams s
         JOIN dinc_runtime.programme_enrolment pe ON pe.enrolment_id = s.enrolment_id
         JOIN dinc_runtime.patient p ON p.patient_id = pe.patient_id
         JOIN dinc_metadata.v_schedule_rule_effective v ON v.event_id = s.event_id
         LEFT JOIN LATERAL (
           SELECT max(x.completed_at)::date AS completed_date
           FROM dinc_runtime.event_instance x
           JOIN dinc_metadata.event de ON de.event_id = x.event_id
           WHERE x.enrolment_id = s.enrolment_id
             AND de.event_code = v.dependency_event_code
             AND x.status = 'COMPLETED'
         ) dep ON v.dependency_event_code IS NOT NULL
         WHERE v.schedule_type = 'RECURRING'
           AND v.repeat_interval_days IS NOT NULL
           AND pe.status = 'ACTIVE'
           AND s.last_status = 'COMPLETED'
           -- context resolution: OVERRIDE row only when its flag is live
           AND (v.condition_context IS NULL OR EXISTS (
                 SELECT 1 FROM dinc_runtime.patient_condition pc
                 WHERE pc.enrolment_id = s.enrolment_id
                   AND pc.condition_code = v.condition_context
                   AND pc.cleared_at IS NULL))
           -- stream not exhausted
           AND (v.repeat_count IS NULL OR s.last_occurrence < v.repeat_count)
           -- stream not terminated by the stop-gate event
           AND (v.repeat_until_event_code IS NULL OR NOT EXISTS (
                 SELECT 1 FROM dinc_runtime.event_instance t
                 JOIN dinc_metadata.event te ON te.event_id = t.event_id
                 WHERE t.enrolment_id = s.enrolment_id
                   AND te.event_code = v.repeat_until_event_code
                   AND t.status = 'COMPLETED'))
           -- anchor resolvable
           AND (v.anchor_type <> 'BIRTH_DATE' OR p.birth_date IS NOT NULL)
           AND (v.anchor_type <> 'PREVIOUS_EVENT_COMPLETION'
                OR dep.completed_date IS NOT NULL)
         ORDER BY s.enrolment_id, s.event_id,
                  (v.condition_context IS NOT NULL) DESC
       )
       INSERT INTO dinc_runtime.event_instance
         (enrolment_id, event_id, occurrence_number, status, due_date,
          condition_context, activated_at, assigned_to, priority, metadata_release_id)
       SELECT n.enrolment_id, n.event_id, n.occurrence_number, 'ACTIVE', n.due_date,
              n.condition_context, now(), n.assigned_to, 'NORMAL',
              (SELECT release_version FROM dinc_metadata.metadata_release
               ORDER BY loaded_at DESC LIMIT 1)
       FROM nextocc n
       ON CONFLICT ON CONSTRAINT uq_ei_occurrence DO NOTHING
       RETURNING event_instance_id AS id,
                 (SELECT event_code FROM dinc_metadata.event e2
                  WHERE e2.event_id = event_instance.event_id) AS event_code,
                 occurrence_number, due_date, condition_context`,
    );
    return res.rows.map(SchedulerRepository.toCreated);
  }

  /**
   * Activity instances for every event_instance the sweep created — exactly the
   * metadata activities of the event: first (by display_order) PENDING, the
   * rest LOCKED (the Step-6A convention). uq_ai_once makes this idempotent.
   */
  private static async createActivityInstances(
    tx: TxClient,
    eventInstanceIds: string[],
  ): Promise<void> {
    await tx.query(
      `INSERT INTO dinc_runtime.activity_instance
         (event_instance_id, activity_id, status)
       SELECT ei.event_instance_id,
              a.activity_id,
              CASE WHEN row_number() OVER (
                     PARTITION BY ei.event_instance_id
                     ORDER BY a.display_order
                   ) = 1
                   THEN 'PENDING' ELSE 'LOCKED' END
       FROM dinc_runtime.event_instance ei
       JOIN dinc_metadata.activity a ON a.event_id = ei.event_id
       WHERE ei.event_instance_id = ANY($1::uuid[])
       ON CONFLICT ON CONSTRAINT uq_ai_once DO NOTHING`,
      [eventInstanceIds],
    );
  }

  /**
   * Phase 3 — follow-up generation for overdue work.
   *
   * For each overdue ACTIVE event_instance (due_date < today) that has no
   * system-generated follow-up yet, one system call_log is recorded (outcome
   * 'NIL' — no response; called_by NULL = system; the marker note makes the
   * NOT EXISTS guard precise) and one followup_task is created. Delay and
   * priority come from the programme's resolved call-outcome rule
   * (v_call_outcome_rule_resolved, outcome NIL), defaulting to 7 days / HIGH.
   * Assignment inherits the event's assignee. followup_task.call_log_id is
   * UNIQUE, so each system call raises at most one task.
   */
  private static async generateFollowups(
    tx: TxClient,
  ): Promise<{ overdueFound: number; followupsCreated: number }> {
    const overdue = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n
       FROM dinc_runtime.event_instance ei
       JOIN dinc_runtime.programme_enrolment pe ON pe.enrolment_id = ei.enrolment_id
       WHERE ei.status = 'ACTIVE' AND pe.status = 'ACTIVE'
         AND ei.due_date < CURRENT_DATE`,
    );

    const created = await tx.query<{ id: string }>(
      `WITH todo AS (
         SELECT ei.event_instance_id,
                ei.enrolment_id,
                ei.assigned_to,
                COALESCE(r.followup_delay_days, 7) AS delay_days,
                COALESCE(r.priority, 'HIGH')       AS priority
         FROM dinc_runtime.event_instance ei
         JOIN dinc_runtime.programme_enrolment pe ON pe.enrolment_id = ei.enrolment_id
         JOIN dinc_metadata.programme pr ON pr.programme_id = pe.programme_id
         LEFT JOIN dinc_metadata.v_call_outcome_rule_resolved r
                ON r.programme_code = pr.programme_code
               AND r.outcome_code = 'NIL'
               AND r.next_action = 'CREATE_FOLLOWUP'
         WHERE ei.status = 'ACTIVE' AND pe.status = 'ACTIVE'
           AND ei.due_date < CURRENT_DATE
           AND NOT EXISTS (
                 SELECT 1 FROM dinc_runtime.call_log cl
                 WHERE cl.event_instance_id = ei.event_instance_id
                   AND cl.called_by IS NULL
                   AND cl.notes LIKE 'SYSTEM_SCHEDULER:%')
       ),
       calls AS (
         INSERT INTO dinc_runtime.call_log
           (enrolment_id, event_instance_id, outcome_code, called_at, called_by, notes)
         SELECT t.enrolment_id, t.event_instance_id, 'NIL', now(), NULL,
                'SYSTEM_SCHEDULER: no response — event overdue'
         FROM todo t
         RETURNING call_log_id, enrolment_id, event_instance_id
       )
       INSERT INTO dinc_runtime.followup_task
         (call_log_id, enrolment_id, due_date, priority, status, assigned_to)
       SELECT c.call_log_id, c.enrolment_id,
              CURRENT_DATE + t.delay_days, t.priority, 'OPEN', t.assigned_to
       FROM calls c
       JOIN todo t ON t.event_instance_id = c.event_instance_id
       ON CONFLICT ON CONSTRAINT uq_ft_call_log DO NOTHING
       RETURNING followup_task_id AS id`,
    );

    return {
      overdueFound: overdue.rows[0]?.n ?? 0,
      followupsCreated: created.rows.length,
    };
  }

  private static toCreated(row: CreatedEventRow): SweepCreatedEvent {
    return {
      eventInstanceId: row.id,
      eventCode: row.event_code,
      occurrence: row.occurrence_number,
      dueDate:
        row.due_date instanceof Date
          ? row.due_date.toISOString().slice(0, 10)
          : String(row.due_date),
      conditionContext: row.condition_context,
    };
  }

  // ── Run log (unchanged shape) ──────────────────────────────────────────────

  /** Persists a completed run and returns it. */
  async insertRun(run: Omit<SchedulerRunDto, 'id'>): Promise<SchedulerRunDto> {
    const result = await this.db.query<RunRow>(
      `INSERT INTO dinc_app.scheduler_runs
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
      `SELECT * FROM dinc_app.scheduler_runs ORDER BY started_at DESC LIMIT $1`,
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
       FROM dinc_app.scheduler_runs`,
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
      trigger: row.trigger as SchedulerRunDto['trigger'],
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
