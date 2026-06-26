import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ActivityRow } from './activity.types';

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
}
