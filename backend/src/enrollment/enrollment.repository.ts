import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  EnrollmentDetailRow,
  EnrollmentSummaryRow,
  ProgramRow,
} from './enrollment.types';

/**
 * Data-access layer for Program & Enrollment reads. This is the ONLY place that
 * holds SQL for this feature — all queries are parameterised, read-only SELECTs
 * against the existing schema. No INSERT/UPDATE/DELETE/DDL anywhere.
 */
@Injectable()
export class EnrollmentRepository {
  constructor(private readonly db: DatabaseService) {}

  /** All active programs, alphabetically. */
  async findActivePrograms(): Promise<ProgramRow[]> {
    const result = await this.db.query<ProgramRow>(
      `SELECT id, code, name, description
       FROM public.programs
       WHERE is_active = true
       ORDER BY name`,
    );
    return result.rows;
  }

  /** Enrollment summaries for one citizen (for program chips + the chip list). */
  async findEnrollmentsByCitizen(citizenId: string): Promise<EnrollmentSummaryRow[]> {
    const result = await this.db.query<EnrollmentSummaryRow>(
      `SELECT e.id,
              e.start_date,
              e.status,
              p.id   AS program_id,
              p.name AS program_name,
              sp.id   AS sub_program_id,
              sp.name AS sub_program_name,
              (
                SELECT w.priority
                FROM public.worklist_items w
                WHERE w.enrollment_id = e.id
                ORDER BY w.due_date ASC NULLS LAST, w.created_at DESC
                LIMIT 1
              ) AS priority
       FROM public.enrollments e
       LEFT JOIN public.programs p ON p.id = e.program_id
       LEFT JOIN public.diseases d ON d.id = e.disease_id
       LEFT JOIN public.sub_programs sp ON sp.id = d.sub_program_id
       WHERE e.citizen_id = $1
       ORDER BY e.start_date DESC NULLS LAST, e.created_at DESC`,
      [citizenId],
    );
    return result.rows;
  }

  /** Complete detail for a single enrollment, or null when not found. */
  async findEnrollmentById(id: string): Promise<EnrollmentDetailRow | null> {
    const result = await this.db.query<EnrollmentDetailRow>(
      `SELECT e.id,
              e.start_date,
              e.status,
              e.assigned_worker,
              e.geographic_unit,
              e.enrolled_by,
              c.id   AS citizen_id,
              c.uhid AS uhid,
              p.id   AS program_id,
              p.name AS program_name,
              sp.id   AS sub_program_id,
              sp.name AS sub_program_name,
              d.name AS disease_name,
              ev.name AS event_name,
              (
                SELECT w.priority
                FROM public.worklist_items w
                WHERE w.enrollment_id = e.id
                ORDER BY w.due_date ASC NULLS LAST, w.created_at DESC
                LIMIT 1
              ) AS priority
       FROM public.enrollments e
       LEFT JOIN public.citizens c ON c.id = e.citizen_id
       LEFT JOIN public.programs p ON p.id = e.program_id
       LEFT JOIN public.diseases d ON d.id = e.disease_id
       LEFT JOIN public.sub_programs sp ON sp.id = d.sub_program_id
       LEFT JOIN public.events ev ON ev.id = e.current_event_id
       WHERE e.id = $1
       LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}
