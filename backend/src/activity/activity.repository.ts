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
  /** Shared projection so the list and detail queries stay identical. */
  private static readonly SELECT = `
    SELECT w.id,
           ev.name AS activity_name,
           w.status,
           w.priority,
           w.assigned_to,
           w.assigned_role,
           w.due_date,
           w.created_at,
           w.outcome_recorded_at AS completed_at,
           w.event_id,
           ev.name AS event_name,
           w.enrollment_id
    FROM public.worklist_items w
    LEFT JOIN public.events ev ON ev.id = w.event_id`;

  constructor(private readonly db: DatabaseService) {}

  /** All activities for one enrollment, ordered by due date then recency. */
  async findByEnrollment(enrollmentId: string): Promise<ActivityRow[]> {
    const result = await this.db.query<ActivityRow>(
      `${ActivityRepository.SELECT}
       WHERE w.enrollment_id = $1
       ORDER BY w.due_date ASC NULLS LAST, w.created_at DESC`,
      [enrollmentId],
    );
    return result.rows;
  }

  /** A single activity by id, or null when not found. */
  async findById(activityId: string): Promise<ActivityRow | null> {
    const result = await this.db.query<ActivityRow>(
      `${ActivityRepository.SELECT}
       WHERE w.id = $1
       LIMIT 1`,
      [activityId],
    );
    return result.rows[0] ?? null;
  }

  // ── Reads supporting the "New Activity" dialog ───────────────────────────

  /** The enrollment's linking context (program/disease/current event), or null. */
  async findEnrollmentCore(enrollmentId: string): Promise<EnrollmentCoreRow | null> {
    const result = await this.db.query<EnrollmentCoreRow>(
      `SELECT id, program_id, disease_id, current_event_id
       FROM public.enrollments
       WHERE id = $1
       LIMIT 1`,
      [enrollmentId],
    );
    return result.rows[0] ?? null;
  }

  /** Active events for a disease (the selectable events for an activity). */
  async findEventsByDisease(diseaseId: string): Promise<EventOption[]> {
    const result = await this.db.query<EventOption>(
      `SELECT id, name
       FROM public.events
       WHERE disease_id = $1 AND is_active = true
       ORDER BY sequence, name`,
      [diseaseId],
    );
    return result.rows;
  }

  /** The disease an event belongs to, or null when the event is unknown. */
  async findDiseaseIdForEvent(eventId: string): Promise<string | null> {
    const result = await this.db.query<{ disease_id: string }>(
      `SELECT disease_id FROM public.events WHERE id = $1 LIMIT 1`,
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
      `SELECT id
       FROM public.worklist_items
       WHERE enrollment_id = $1 AND event_id = $2
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
       FROM public.users
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
       FROM public.enrollments e
       JOIN public.users u
         ON u.username = e.assigned_worker AND u.is_active = true
       WHERE e.id = $1
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
}
