import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  CreateEnrollmentInput,
  EventActivityDto,
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

  /**
   * All programmes from the frozen DiNc metadata (Step 2 migration).
   * dinc_metadata.programme has no is_active/description columns — every row in
   * the deployed metadata release is live; description surfaces as NULL.
   */
  async findActivePrograms(): Promise<ProgramRow[]> {
    const result = await this.db.query<ProgramRow>(
      `SELECT programme_id AS id,
              programme_code AS code,
              programme_name AS name,
              NULL::text AS description
       FROM dinc_metadata.programme
       ORDER BY display_order, programme_name`,
    );
    return result.rows;
  }

  /** Enrollment summaries for one citizen (for program chips + the chip list). */
  async findEnrollmentsByCitizen(citizenId: string): Promise<EnrollmentSummaryRow[]> {
    const result = await this.db.query<EnrollmentSummaryRow>(
      `SELECT e.enrolment_id AS id,
              e.registration_date AS start_date,
              e.status,
              pr.programme_id AS program_id,
              pr.programme_name AS program_name,
              NULL::uuid AS sub_program_id,
              NULL::text AS sub_program_name,
              (
                SELECT ei.priority
                FROM dinc_runtime.event_instance ei
                WHERE ei.enrolment_id = e.enrolment_id
                ORDER BY ei.due_date ASC NULLS LAST, ei.created_at DESC
                LIMIT 1
              ) AS priority
       FROM dinc_runtime.programme_enrolment e
       LEFT JOIN dinc_metadata.programme pr ON pr.programme_id = e.programme_id
       WHERE e.patient_id = $1
       ORDER BY e.registration_date DESC NULLS LAST, e.created_at DESC`,
      [citizenId],
    );
    return result.rows;
  }

  /** Complete detail for a single enrollment, or null when not found. */
  async findEnrollmentById(id: string): Promise<EnrollmentDetailRow | null> {
    const result = await this.db.query<EnrollmentDetailRow>(
      `SELECT e.enrolment_id AS id,
              e.registration_date AS start_date,
              e.status,
              NULL::text AS assigned_worker,
              NULL::text AS geographic_unit,
              NULL::text AS enrolled_by,
              c.patient_id AS citizen_id,
              c.external_id AS uhid,
              pr.programme_id AS program_id,
              pr.programme_name AS program_name,
              NULL::uuid AS sub_program_id,
              NULL::text AS sub_program_name,
              cond.condition_code AS disease_name,
              ev.event_name AS event_name,
              NULL::text AS remarks,
              (
                SELECT ei.priority
                FROM dinc_runtime.event_instance ei
                WHERE ei.enrolment_id = e.enrolment_id
                ORDER BY ei.due_date ASC NULLS LAST, ei.created_at DESC
                LIMIT 1
              ) AS priority
       FROM dinc_runtime.programme_enrolment e
       LEFT JOIN dinc_runtime.patient c ON c.patient_id = e.patient_id
       LEFT JOIN dinc_metadata.programme pr ON pr.programme_id = e.programme_id
       LEFT JOIN LATERAL (
         SELECT ei.event_id
         FROM dinc_runtime.event_instance ei
         WHERE ei.enrolment_id = e.enrolment_id AND ei.completed_at IS NULL
         ORDER BY ei.due_date ASC NULLS LAST, ei.created_at DESC
         LIMIT 1
       ) cur ON true
       LEFT JOIN dinc_metadata.event ev ON ev.event_id = cur.event_id
       LEFT JOIN LATERAL (
         SELECT pc.condition_code
         FROM dinc_runtime.patient_condition pc
         WHERE pc.enrolment_id = e.enrolment_id AND pc.cleared_at IS NULL
         ORDER BY pc.flagged_at DESC
         LIMIT 1
       ) cond ON true
       WHERE e.enrolment_id = $1
       LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  // ── Cascade reads (populate the Add Program dialog) ──────────────────────
  //
  // Step 2 migration: the old 4-level hierarchy (program → sub_program →
  // disease → event) collapses to DiNc's 3-level metadata hierarchy
  // (programme → event → activity). The two removed levels are shimmed by
  // mirroring the programme itself, so the existing cascade API/UI keeps
  // working: a "sub-programme" id and a "disease" id ARE the programme id.

  async findSubProgramsByProgram(programId: string): Promise<SubProgramDto[]> {
    const result = await this.db.query<SubProgramDto>(
      `SELECT programme_id AS id, programme_name AS name
       FROM dinc_metadata.programme
       WHERE programme_id = $1`,
      [programId],
    );
    return result.rows;
  }

  async findDiseasesBySubProgram(subProgramId: string): Promise<DiseaseDto[]> {
    const result = await this.db.query<DiseaseDto>(
      `SELECT programme_id AS id, programme_name AS name
       FROM dinc_metadata.programme
       WHERE programme_id = $1`,
      [subProgramId],
    );
    return result.rows;
  }

  /** Events for a programme (the incoming "disease" id is the programme id). */
  async findEventsByDisease(diseaseId: string): Promise<EventDto[]> {
    const result = await this.db.query<EventDto>(
      `SELECT event_id AS id, event_name AS name
       FROM dinc_metadata.event
       WHERE programme_id = $1
       ORDER BY display_order, event_name`,
      [diseaseId],
    );
    return result.rows;
  }

  /** Activities for an event — third level of the DiNc metadata hierarchy. */
  async findActivitiesByEvent(eventId: string): Promise<EventActivityDto[]> {
    const result = await this.db.query<EventActivityDto>(
      `SELECT activity_id AS id, activity_code AS code, activity_name AS name
       FROM dinc_metadata.activity
       WHERE event_id = $1
       ORDER BY display_order, activity_name`,
      [eventId],
    );
    return result.rows;
  }

  // ── Validation lookups ───────────────────────────────────────────────────

  async citizenExists(citizenId: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM dinc_runtime.patient WHERE patient_id = $1) AS exists`,
      [citizenId],
    );
    return result.rows[0]?.exists ?? false;
  }

  async isProgramActive(programId: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM dinc_metadata.programme WHERE programme_id = $1
       ) AS exists`,
      [programId],
    );
    return result.rows[0]?.exists ?? false;
  }

  /**
   * Step 2 shim: a "disease"/condition id IS the programme id in the collapsed
   * hierarchy, so this validates existence and returns the same id.
   */
  async findProgramIdForDisease(diseaseId: string): Promise<string | null> {
    const result = await this.db.query<{ program_id: string }>(
      `SELECT programme_id AS program_id
       FROM dinc_metadata.programme
       WHERE programme_id = $1
       LIMIT 1`,
      [diseaseId],
    );
    return result.rows[0]?.program_id ?? null;
  }

  /**
   * Returns the programme an event belongs to (acts as the shimmed "disease"
   * id in the collapsed hierarchy), or null when the event is unknown.
   */
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
   * Resolves an enrollment's clinical context — the programme, disease and
   * current-event ids plus a name/code text blob — used to look up the matching
   * guidebook (structured guidebook_mappings first, text rules as a fallback).
   * Returns null when the enrollment does not exist.
   */
  async findEnrollmentContext(enrollmentId: string): Promise<{
    programId: string | null;
    diseaseId: string | null;
    eventId: string | null;
    haystack: string;
  } | null> {
    const result = await this.db.query<{
      program_id: string | null;
      disease_id: string | null;
      event_id: string | null;
      haystack: string;
    }>(
      `SELECT e.programme_id AS program_id,
              e.programme_id AS disease_id,
              cur.event_id AS event_id,
              COALESCE(pr.programme_name, '') || ' ' || COALESCE(pr.programme_code, '') || ' ' ||
              COALESCE(ev.event_name, '') || ' ' ||
              COALESCE((SELECT string_agg(pc.condition_code, ' ')
                        FROM dinc_runtime.patient_condition pc
                        WHERE pc.enrolment_id = e.enrolment_id
                          AND pc.cleared_at IS NULL), '') AS haystack
       FROM dinc_runtime.programme_enrolment e
       LEFT JOIN dinc_metadata.programme pr ON pr.programme_id = e.programme_id
       LEFT JOIN LATERAL (
         SELECT ei.event_id
         FROM dinc_runtime.event_instance ei
         WHERE ei.enrolment_id = e.enrolment_id AND ei.completed_at IS NULL
         ORDER BY ei.due_date ASC NULLS LAST, ei.created_at DESC
         LIMIT 1
       ) cur ON true
       LEFT JOIN dinc_metadata.event ev ON ev.event_id = cur.event_id
       WHERE e.enrolment_id = $1
       LIMIT 1`,
      [enrollmentId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      programId: row.program_id,
      diseaseId: row.disease_id,
      eventId: row.event_id,
      haystack: row.haystack,
    };
  }

  async hasActiveEnrollment(citizenId: string, programId: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM dinc_runtime.programme_enrolment
         WHERE patient_id = $1 AND programme_id = $2 AND status = 'ACTIVE'
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
