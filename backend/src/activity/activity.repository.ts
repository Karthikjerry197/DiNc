import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ActivityRow,
  AssigneeOption,
  CreateActivityInput,
  EnrollmentCoreRow,
  EventOption,
} from './activity.types';

/**
 * Data-access layer for activities. The ONLY place holding SQL for this feature.
 * All queries are parameterised, read-only SELECTs against existing tables — no
 * INSERT/UPDATE/DELETE/DDL anywhere.
 */
@Injectable()
export class ActivityRepository {
  /**
   * Shared projection so the list and detail queries stay identical.
   * Step 4: an "activity" row is an event_instance; activity_name is the
   * current (first incomplete) activity_instance's metadata name, falling back
   * to the event name. ACTIVE derives to PENDING for the legacy UI contract;
   * LOCKED/COMPLETED pass through. Assignee ids resolve to app_user usernames.
   */
  private static readonly SELECT = `
    SELECT ei.event_instance_id AS id,
           COALESCE(act.activity_name, ev.event_name) AS activity_name,
           CASE ei.status WHEN 'ACTIVE' THEN 'PENDING' ELSE ei.status END AS status,
           COALESCE(ei.priority, 'NORMAL') AS priority,
           au.username AS assigned_to,
           au.role AS assigned_role,
           ei.due_date,
           ei.created_at,
           ei.completed_at,
           ei.event_id,
           ev.event_name AS event_name,
           ei.enrolment_id AS enrollment_id
    FROM dinc_runtime.event_instance ei
    LEFT JOIN dinc_metadata.event ev ON ev.event_id = ei.event_id
    LEFT JOIN dinc_security.app_user au ON au.user_id = ei.assigned_to
    LEFT JOIN LATERAL (
      SELECT a.activity_name
      FROM dinc_runtime.activity_instance ai
      JOIN dinc_metadata.activity a ON a.activity_id = ai.activity_id
      WHERE ai.event_instance_id = ei.event_instance_id
        AND ai.completed_at IS NULL
      ORDER BY a.display_order
      LIMIT 1
    ) act ON true`;

  constructor(private readonly db: DatabaseService) {}

  /** All activities for one enrollment, ordered by due date then recency. */
  async findByEnrollment(enrollmentId: string): Promise<ActivityRow[]> {
    const result = await this.db.query<ActivityRow>(
      `${ActivityRepository.SELECT}
       WHERE ei.enrolment_id = $1
       ORDER BY ei.due_date ASC NULLS LAST, ei.created_at DESC`,
      [enrollmentId],
    );
    return result.rows;
  }

  /** A single activity by id, or null when not found. */
  async findById(activityId: string): Promise<ActivityRow | null> {
    const result = await this.db.query<ActivityRow>(
      `${ActivityRepository.SELECT}
       WHERE ei.event_instance_id = $1
       LIMIT 1`,
      [activityId],
    );
    return result.rows[0] ?? null;
  }

  // ── Reads supporting the "New Activity" dialog ───────────────────────────

  /** The enrollment's linking context (program/disease/current event), or null. */
  async findEnrollmentCore(enrollmentId: string): Promise<EnrollmentCoreRow | null> {
    const result = await this.db.query<EnrollmentCoreRow>(
      `SELECT e.enrolment_id AS id,
              e.programme_id AS program_id,
              e.programme_id AS disease_id,
              cur.event_id AS current_event_id
       FROM dinc_runtime.programme_enrolment e
       LEFT JOIN LATERAL (
         SELECT ei.event_id
         FROM dinc_runtime.event_instance ei
         WHERE ei.enrolment_id = e.enrolment_id AND ei.completed_at IS NULL
         ORDER BY ei.due_date ASC NULLS LAST, ei.created_at DESC
         LIMIT 1
       ) cur ON true
       WHERE e.enrolment_id = $1
       LIMIT 1`,
      [enrollmentId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Events for a programme (Step 2: the collapsed hierarchy's "disease" id IS
   * the programme id — see enrollment.repository cascade shim).
   */
  async findEventsByDisease(diseaseId: string): Promise<EventOption[]> {
    const result = await this.db.query<EventOption>(
      `SELECT event_id AS id, event_name AS name
       FROM dinc_metadata.event
       WHERE programme_id = $1
       ORDER BY display_order, event_name`,
      [diseaseId],
    );
    return result.rows;
  }

  /** The programme an event belongs to (shimmed "disease" id), or null. */
  async findDiseaseIdForEvent(eventId: string): Promise<string | null> {
    const result = await this.db.query<{ disease_id: string }>(
      `SELECT programme_id AS disease_id
       FROM dinc_metadata.event
       WHERE event_id = $1
       LIMIT 1`,
      [eventId],
    );
    return result.rows[0]?.disease_id ?? null;
  }

  /**
   * The id of the earliest existing activity for an enrollment + event, or null.
   * Used to keep automatic initial-activity creation idempotent (no duplicates
   * when enrollment creation is retried).
   */
  async findActivityIdForEnrollmentEvent(
    enrollmentId: string,
    eventId: string,
  ): Promise<string | null> {
    const result = await this.db.query<{ id: string }>(
      `SELECT event_instance_id AS id
       FROM dinc_runtime.event_instance
       WHERE enrolment_id = $1 AND event_id = $2
       ORDER BY created_at ASC
       LIMIT 1`,
      [enrollmentId, eventId],
    );
    return result.rows[0]?.id ?? null;
  }

  /** Active users available to be assigned an activity. */
  async findAssignableUsers(): Promise<AssigneeOption[]> {
    const result = await this.db.query<{ username: string; full_name: string }>(
      `SELECT username, full_name
       FROM dinc_security.app_user
       WHERE is_active = true
       ORDER BY full_name`,
    );
    return result.rows.map((row) => ({ username: row.username, fullName: row.full_name }));
  }

  /**
   * The assignment target for automatically created activities (M31): the
   * enrollment's care worker (`enrollments.assigned_worker`, set at
   * registration or manual enrollment) and that worker's role from the Users
   * module. Both null when the enrollment has no worker or the worker is no
   * longer an active user — the activity is then left unassigned for the
   * global/admin worklist.
   */
  async findEnrollmentAssignee(
    enrollmentId: string,
  ): Promise<{ assignedWorker: string | null; workerRole: string | null }> {
    const result = await this.db.query<{
      assigned_worker: string | null;
      worker_role: string | null;
    }>(
      `SELECT u.username AS assigned_worker, u.role AS worker_role
       FROM dinc_runtime.programme_enrolment e
       JOIN LATERAL (
         SELECT ei.assigned_to
         FROM dinc_runtime.event_instance ei
         WHERE ei.enrolment_id = e.enrolment_id AND ei.assigned_to IS NOT NULL
         ORDER BY ei.created_at DESC
         LIMIT 1
       ) latest ON true
       JOIN dinc_security.app_user u
         ON u.user_id = latest.assigned_to AND u.is_active = true
       WHERE e.enrolment_id = $1
       LIMIT 1`,
      [enrollmentId],
    );
    const row = result.rows[0];
    return {
      assignedWorker: row?.assigned_worker ?? null,
      workerRole: row?.worker_role ?? null,
    };
  }

  // ── Write (the single INSERT for this milestone) ─────────────────────────

  /**
   * Inserts one activity (worklist_items row) using only existing columns and
   * returns its new id, or null when the target enrollment no longer exists.
   *
   * The INSERT ... SELECT ... WHERE EXISTS guard guarantees, at write time, that
   * an activity can never be created against a missing enrollment — so the data
   * cannot become orphaned this way. New activities start PENDING; `version` is 1.
   */
  async insertActivity(input: CreateActivityInput): Promise<string | null> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO public.worklist_items
         (enrollment_id, event_id, program_id, disease_id, assigned_to, assigned_role, due_date, priority, status, version)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', 1
       WHERE EXISTS (SELECT 1 FROM public.enrollments e WHERE e.id = $1)
       RETURNING id`,
      [
        input.enrollmentId,
        input.eventId,
        input.programId,
        input.diseaseId,
        input.assignedTo,
        input.assignedRole,
        input.dueDate,
        input.priority,
      ],
    );
    return result.rows[0]?.id ?? null;
  }

  // ── Lifecycle writes (used by start-call and the Workflow Rules Engine) ───

  /**
   * Transitions an activity to a new lifecycle state. Stamps outcome_recorded_at
   * when `complete`; flags escalation and raises priority when `escalate`. Bumps
   * `version` for optimistic concurrency (rows are created with version = 1).
   */
  async updateStatus(
    activityId: string,
    status: string,
    complete: boolean,
    escalate: boolean,
  ): Promise<void> {
    await this.db.query(
      `UPDATE public.worklist_items
         SET status = $2,
             is_escalation = is_escalation OR $4,
             priority = CASE WHEN $4 THEN 'URGENT' ELSE priority END,
             outcome_recorded_at = CASE WHEN $3 THEN now() ELSE outcome_recorded_at END,
             version = version + 1,
             updated_at = now()
       WHERE id = $1`,
      [activityId, status, complete, escalate],
    );
  }

  /** Pushes an activity's due date forward by `days` and keeps it PENDING (retry). */
  async shiftDueDateDays(activityId: string, days: number): Promise<void> {
    await this.db.query(
      `UPDATE public.worklist_items
         SET due_date = CURRENT_DATE + ($2 || ' days')::interval,
             status = 'PENDING',
             version = version + 1,
             updated_at = now()
       WHERE id = $1`,
      [activityId, Math.max(0, Math.round(days))],
    );
  }

  /** Increments the attempt counter and returns the new value. */
  async incrementRetry(activityId: string): Promise<number> {
    const result = await this.db.query<{ retry_count: number }>(
      `UPDATE public.worklist_items
         SET retry_count = retry_count + 1, version = version + 1, updated_at = now()
       WHERE id = $1
       RETURNING retry_count`,
      [activityId],
    );
    return result.rows[0]?.retry_count ?? 0;
  }

  // ── Step 6A: activity lifecycle progression (metadata-driven) ─────────────

  /**
   * Completes one activity_instance and advances the lifecycle, all in ONE
   * transaction (full rollback on any failure):
   *
   *   1. activity_instance → COMPLETED (completed_at stamped, per CHECK).
   *   2. Next incomplete activity of the same event (metadata display_order)
   *      is activated (LOCKED → PENDING; already-PENDING rows are left as-is,
   *      tolerating the Step-5 all-PENDING creation shape).
   *   3. When no incomplete activity remains, the event_instance completes.
   *   4-5. v_schedule_rule_effective is read and dependent events whose
   *      dependency is now satisfied are activated: ONE_TIME rules anchored on
   *      PREVIOUS_EVENT_COMPLETION, unconditional (no existence_condition),
   *      default context (no overrides / HIGH_RISK — Step 6B), not already
   *      instantiated for the enrolment. due = today + offset_days; the
   *      completed event's assignee is inherited; release stamped.
   *   6. Each newly activated event gets its activity_instance rows: first by
   *      display_order PENDING, the rest LOCKED.
   *
   * Recurring / birth-date / follow-up / repeat_until rules are deliberately
   * ignored here (Step 6B+). Returns null when the activity instance does not
   * exist or is already completed.
   */
  async completeActivityInstance(activityInstanceId: string): Promise<{
    eventInstanceId: string;
    eventCompleted: boolean;
    nextActivityInstanceId: string | null;
    activatedEvents: { eventInstanceId: string; eventCode: string; dueDate: string }[];
  } | null> {
    return this.db.withTransaction(async (tx) => {
      // 1. Complete the activity instance.
      const done = await tx.query<{ event_instance_id: string }>(
        `UPDATE dinc_runtime.activity_instance
           SET status = 'COMPLETED', completed_at = now()
         WHERE activity_instance_id = $1 AND status <> 'COMPLETED'
         RETURNING event_instance_id`,
        [activityInstanceId],
      );
      if (!done.rows[0]) return null;
      const eventInstanceId = done.rows[0].event_instance_id;

      // 2. Activate the next incomplete activity (by metadata display_order).
      const next = await tx.query<{ activity_instance_id: string; status: string }>(
        `SELECT ai.activity_instance_id, ai.status
         FROM dinc_runtime.activity_instance ai
         JOIN dinc_metadata.activity a ON a.activity_id = ai.activity_id
         WHERE ai.event_instance_id = $1 AND ai.completed_at IS NULL
         ORDER BY a.display_order
         LIMIT 1`,
        [eventInstanceId],
      );

      let nextActivityInstanceId: string | null = null;
      let eventCompleted = false;
      const activatedEvents: { eventInstanceId: string; eventCode: string; dueDate: string }[] = [];

      if (next.rows[0]) {
        nextActivityInstanceId = next.rows[0].activity_instance_id;
        if (next.rows[0].status === 'LOCKED') {
          await tx.query(
            `UPDATE dinc_runtime.activity_instance
               SET status = 'PENDING'
             WHERE activity_instance_id = $1`,
            [nextActivityInstanceId],
          );
        }
        return { eventInstanceId, eventCompleted, nextActivityInstanceId, activatedEvents };
      }

      // 3. All activities complete → complete the event.
      const ev = await tx.query<{
        enrolment_id: string;
        event_code: string;
        assigned_to: string | null;
      }>(
        `UPDATE dinc_runtime.event_instance ei
           SET status = 'COMPLETED', completed_at = now()
         FROM dinc_metadata.event e
         WHERE ei.event_instance_id = $1
           AND ei.status <> 'COMPLETED'
           AND e.event_id = ei.event_id
         RETURNING ei.enrolment_id, e.event_code, ei.assigned_to`,
        [eventInstanceId],
      );
      const evRow = ev.rows[0];
      if (!evRow) {
        return { eventInstanceId, eventCompleted, nextActivityInstanceId, activatedEvents };
      }
      eventCompleted = true;

      // 4-5. Activate dependent events whose dependency is now satisfied.
      const created = await tx.query<{ id: string; event_id: string; due_date: Date }>(
        `INSERT INTO dinc_runtime.event_instance
           (enrolment_id, event_id, occurrence_number, status, due_date,
            activated_at, assigned_to, priority, metadata_release_id)
         SELECT $1,
                v.event_id,
                1,
                'ACTIVE',
                CURRENT_DATE + COALESCE(v.offset_days, 0),
                now(),
                $3,
                'NORMAL',
                (SELECT release_version FROM dinc_metadata.metadata_release
                 ORDER BY loaded_at DESC LIMIT 1)
         FROM dinc_metadata.v_schedule_rule_effective v
         WHERE v.dependency_event_code = $2
           AND v.schedule_type = 'ONE_TIME'
           AND v.anchor_type = 'PREVIOUS_EVENT_COMPLETION'
           AND v.existence_condition IS NULL
           AND v.condition_context IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM dinc_runtime.event_instance x
             WHERE x.enrolment_id = $1 AND x.event_id = v.event_id
           )
         RETURNING event_instance_id AS id, event_id, due_date`,
        [evRow.enrolment_id, evRow.event_code, evRow.assigned_to],
      );

      if (created.rows.length > 0) {
        // 6. Activity instances for each newly activated event:
        //    first activity PENDING, the rest LOCKED.
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
           WHERE ei.event_instance_id = ANY($1::uuid[])`,
          [created.rows.map((r) => r.id)],
        );

        const codes = await tx.query<{ event_id: string; event_code: string }>(
          `SELECT event_id, event_code FROM dinc_metadata.event
           WHERE event_id = ANY($1::uuid[])`,
          [created.rows.map((r) => r.event_id)],
        );
        const codeByEventId = new Map(codes.rows.map((r) => [r.event_id, r.event_code]));
        for (const r of created.rows) {
          activatedEvents.push({
            eventInstanceId: r.id,
            eventCode: codeByEventId.get(r.event_id) ?? r.event_id,
            dueDate: r.due_date.toISOString().slice(0, 10),
          });
        }
      }

      return { eventInstanceId, eventCompleted, nextActivityInstanceId, activatedEvents };
    });
  }
}
