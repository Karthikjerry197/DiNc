import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  CreateEnrollmentInput,
  DiseaseDto,
  EnrollmentDetailRow,
  EnrollmentSummaryRow,
  EventDto,
  ProgramRow,
  SubProgramDto,
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
              (e.metadata ->> 'remarks') AS remarks,
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

  // ── Cascade reads (populate the Add Program dialog) ──────────────────────

  async findSubProgramsByProgram(programId: string): Promise<SubProgramDto[]> {
    const result = await this.db.query<SubProgramDto>(
      `SELECT id, name
       FROM public.sub_programs
       WHERE program_id = $1 AND is_active = true
       ORDER BY name`,
      [programId],
    );
    return result.rows;
  }

  async findDiseasesBySubProgram(subProgramId: string): Promise<DiseaseDto[]> {
    const result = await this.db.query<DiseaseDto>(
      `SELECT id, name
       FROM public.diseases
       WHERE sub_program_id = $1 AND is_active = true
       ORDER BY name`,
      [subProgramId],
    );
    return result.rows;
  }

  async findEventsByDisease(diseaseId: string): Promise<EventDto[]> {
    const result = await this.db.query<EventDto>(
      `SELECT id, name
       FROM public.events
       WHERE disease_id = $1 AND is_active = true
       ORDER BY sequence, name`,
      [diseaseId],
    );
    return result.rows;
  }

  // ── Validation lookups ───────────────────────────────────────────────────

  async citizenExists(citizenId: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM public.citizens WHERE id = $1) AS exists`,
      [citizenId],
    );
    return result.rows[0]?.exists ?? false;
  }

  async isProgramActive(programId: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM public.programs WHERE id = $1 AND is_active = true
       ) AS exists`,
      [programId],
    );
    return result.rows[0]?.exists ?? false;
  }

  /** Returns the program a disease belongs to (via its sub-program), or null. */
  async findProgramIdForDisease(diseaseId: string): Promise<string | null> {
    const result = await this.db.query<{ program_id: string }>(
      `SELECT sp.program_id
       FROM public.diseases d
       JOIN public.sub_programs sp ON sp.id = d.sub_program_id
       WHERE d.id = $1
       LIMIT 1`,
      [diseaseId],
    );
    return result.rows[0]?.program_id ?? null;
  }

  /** Returns the disease an event belongs to, or null when the event is unknown. */
  async findDiseaseIdForEvent(eventId: string): Promise<string | null> {
    const result = await this.db.query<{ disease_id: string }>(
      `SELECT disease_id FROM public.events WHERE id = $1 LIMIT 1`,
      [eventId],
    );
    return result.rows[0]?.disease_id ?? null;
  }

  /**
   * Builds the clinical-context text for an enrollment (program + disease +
   * current event, names and codes) used to resolve the matching guidebook.
   * Returns null when the enrollment does not exist.
   */
  async findEnrollmentHaystack(enrollmentId: string): Promise<string | null> {
    const result = await this.db.query<{ haystack: string }>(
      `SELECT COALESCE(p.name, '') || ' ' || COALESCE(p.code, '') || ' ' ||
              COALESCE(d.name, '') || ' ' || COALESCE(d.code, '') || ' ' ||
              COALESCE(ev.name, '') AS haystack
       FROM public.enrollments e
       LEFT JOIN public.programs p ON p.id = e.program_id
       LEFT JOIN public.diseases d ON d.id = e.disease_id
       LEFT JOIN public.events ev ON ev.id = e.current_event_id
       WHERE e.id = $1
       LIMIT 1`,
      [enrollmentId],
    );
    return result.rows[0]?.haystack ?? null;
  }

  async hasActiveEnrollment(citizenId: string, programId: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM public.enrollments
         WHERE citizen_id = $1 AND program_id = $2 AND status = 'ACTIVE'
       ) AS exists`,
      [citizenId, programId],
    );
    return result.rows[0]?.exists ?? false;
  }

  // ── Write (the single INSERT for this milestone) ─────────────────────────

  /**
   * Inserts one enrollment using only existing columns and returns its new id.
   * Optional remarks are stored inside the existing metadata jsonb column.
   */
  async insertEnrollment(input: CreateEnrollmentInput): Promise<string> {
    const metadata = input.remarks ? JSON.stringify({ remarks: input.remarks }) : null;
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO public.enrollments
         (citizen_id, program_id, disease_id, current_event_id, start_date, status, enrolled_by, assigned_worker, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id`,
      [
        input.citizenId,
        input.programId,
        input.diseaseId,
        input.eventId,
        input.startDate,
        input.status,
        input.enrolledBy,
        input.assignedTo,
        metadata,
      ],
    );
    return result.rows[0].id;
  }

  /**
   * Advances the enrollment to its next scheduled event as the care plan
   * progresses. Used by the consultation engine when a completed activity
   * generates the next one.
   */
  async advanceCurrentEvent(enrollmentId: string, eventId: string): Promise<void> {
    await this.db.query(
      `UPDATE public.enrollments
         SET current_event_id = $2, updated_at = now()
       WHERE id = $1`,
      [enrollmentId, eventId],
    );
  }

  /** Updates an enrollment's lifecycle status (e.g. COMPLETED at end of plan). */
  async setStatus(enrollmentId: string, status: string): Promise<void> {
    await this.db.query(
      `UPDATE public.enrollments
         SET status = $2, updated_at = now()
       WHERE id = $1`,
      [enrollmentId, status],
    );
  }
}
