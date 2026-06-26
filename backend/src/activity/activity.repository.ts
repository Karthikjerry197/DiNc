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
         (enrollment_id, event_id, program_id, disease_id, assigned_to, due_date, priority, status, version)
       SELECT $1, $2, $3, $4, $5, $6, $7, 'PENDING', 1
       WHERE EXISTS (SELECT 1 FROM public.enrollments e WHERE e.id = $1)
       RETURNING id`,
      [
        input.enrollmentId,
        input.eventId,
        input.programId,
        input.diseaseId,
        input.assignedTo,
        input.dueDate,
        input.priority,
      ],
    );
    return result.rows[0]?.id ?? null;
  }
}
