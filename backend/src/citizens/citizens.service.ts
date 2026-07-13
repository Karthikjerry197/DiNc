import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ActivityEntry,
  BulkUploadResult,
  CitizenDetail,
  CitizenListItem,
  CompletionStats,
  CreateCitizenInput,
  EnrollmentInfo,
  ProgramChip,
} from './citizens.types';

/**
 * Read-only data source for the Citizen Workspace.
 *
 * Issues only SELECT statements against existing tables. Each section of the
 * detail view is resolved independently and defensively so a single failing
 * query degrades to an empty state rather than failing the whole page.
 */
@Injectable()
export class CitizensService {
  private readonly logger = new Logger(CitizensService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Citizen list, enriched for client-side filtering (M33.1): each row carries
   * its enrollment programs / diseases / statuses / care workers plus the
   * severest ACTIVE clinical-alert level (CDSE data — no new risk logic).
   */
  async list(): Promise<CitizenListItem[]> {
    try {
      const result = await this.db.query<{
        id: string;
        uhid: string;
        full_name: string | null;
        age: number | null;
        gender: string | null;
        district: string | null;
        programs: string[] | null;
        diseases: string[] | null;
        statuses: string[] | null;
        workers: string[] | null;
        risk_level: string | null;
      }>(
        `SELECT c.patient_id AS id,
                c.external_id AS uhid,
                c.full_name,
                date_part('year', age(c.birth_date))::int AS age,
                c.sex AS gender,
                c.district,
                (SELECT array_agg(DISTINCT pr.programme_name)
                 FROM dinc_runtime.programme_enrolment e
                 JOIN dinc_metadata.programme pr ON pr.programme_id = e.programme_id
                 WHERE e.patient_id = c.patient_id) AS programs,
                (SELECT array_agg(DISTINCT pc.condition_code)
                 FROM dinc_runtime.patient_condition pc
                 WHERE pc.patient_id = c.patient_id AND pc.cleared_at IS NULL) AS diseases,
                (SELECT array_agg(DISTINCT e.status)
                 FROM dinc_runtime.programme_enrolment e
                 WHERE e.patient_id = c.patient_id) AS statuses,
                NULL::text[] AS workers,
                (SELECT CASE
                          WHEN bool_or(ca.risk_level = 'SEVERE') THEN 'SEVERE'
                          WHEN bool_or(ca.risk_level = 'MODERATE') THEN 'MODERATE'
                        END
                 FROM dinc_app.clinical_alerts ca
                 WHERE ca.citizen_id = c.patient_id AND ca.status = 'ACTIVE') AS risk_level
         FROM dinc_runtime.patient c
         ORDER BY c.created_at DESC
         LIMIT 100`,
      );
      return result.rows.map((row) => ({
        id: row.id,
        uhid: row.uhid,
        fullName: row.full_name,
        age: row.age,
        gender: row.gender,
        district: row.district,
        programs: row.programs ?? [],
        diseases: row.diseases ?? [],
        statuses: row.statuses ?? [],
        workers: row.workers ?? [],
        riskLevel: row.risk_level,
      }));
    } catch (error) {
      this.logger.warn(`Citizens list query failed: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Registers a new patient. Relies on the existing UNIQUE(uhid) constraint:
   * the guarded INSERT does nothing on a duplicate UHID, which we surface as a
   * clean 409 rather than a database error.
   */
  async create(input: CreateCitizenInput): Promise<CitizenListItem> {
    const id = await this.insertCitizen(input);
    if (!id) {
      throw new ConflictException('A patient with this UHID already exists.');
    }
    return {
      id,
      uhid: input.uhid,
      fullName: input.fullName,
      age: input.age,
      gender: input.gender,
      district: input.district,
      // A just-registered citizen has no enrollments or alerts yet.
      programs: [],
      diseases: [],
      statuses: [],
      workers: [],
      riskLevel: null,
    };
  }

  /**
   * Bulk-registers patients (reusing the same per-row insert as single
   * registration). Duplicates (by UHID) are skipped, not errors; per-row failures
   * are reported so the upload as a whole never fails wholesale.
   */
  async bulkCreate(rows: CreateCitizenInput[]): Promise<BulkUploadResult> {
    const result: BulkUploadResult = {
      total: rows.length,
      created: 0,
      skipped: 0,
      errors: [],
    };
    for (const row of rows) {
      try {
        const id = await this.insertCitizen(row);
        if (id) result.created += 1;
        else result.skipped += 1; // duplicate UHID
      } catch (error) {
        result.errors.push({ uhid: row.uhid ?? null, reason: (error as Error).message });
      }
    }
    return result;
  }

  /** Single guarded INSERT (ON CONFLICT DO NOTHING); returns the new id or null. */
  private async insertCitizen(input: CreateCitizenInput): Promise<string | null> {
    const res = await this.db.query<{ id: string }>(
      `INSERT INTO public.citizens (uhid, full_name, age, gender, phone, district)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (uhid) DO NOTHING
       RETURNING id`,
      [input.uhid, input.fullName, input.age, input.gender, input.phone, input.district],
    );
    return res.rows[0]?.id ?? null;
  }

  /** Returns full detail for a citizen, or null when the id matches no record. */
  async detail(id: string): Promise<CitizenDetail | null> {
    const citizen = await this.citizen(id);
    if (!citizen) return null;

    const [programs, enrollment, activities, stats] = await Promise.all([
      this.programs(id),
      this.enrollment(id),
      this.activities(id),
      this.stats(id),
    ]);

    return { citizen, programs, enrollment, activities, stats };
  }

  private async citizen(id: string): Promise<CitizenDetail['citizen'] | null> {
    try {
      const result = await this.db.query<{
        id: string;
        uhid: string;
        full_name: string | null;
        age: number | null;
        gender: string | null;
        phone: string | null;
        district: string | null;
      }>(
        `SELECT patient_id AS id,
                external_id AS uhid,
                full_name,
                date_part('year', age(birth_date))::int AS age,
                sex AS gender,
                phone,
                district
         FROM dinc_runtime.patient
         WHERE patient_id = $1
         LIMIT 1`,
        [id],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        uhid: row.uhid,
        fullName: row.full_name,
        age: row.age,
        gender: row.gender,
        phone: row.phone,
        district: row.district,
      };
    } catch (error) {
      this.logger.warn(`Citizen lookup failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async programs(citizenId: string): Promise<ProgramChip[]> {
    try {
      const result = await this.db.query<ProgramChip>(
        `SELECT DISTINCT pr.programme_id AS id, pr.programme_name AS name
         FROM dinc_runtime.programme_enrolment e
         JOIN dinc_metadata.programme pr ON pr.programme_id = e.programme_id
         WHERE e.patient_id = $1
         ORDER BY pr.programme_name`,
        [citizenId],
      );
      return result.rows;
    } catch (error) {
      this.logger.warn(`Citizen programs query failed: ${(error as Error).message}`);
      return [];
    }
  }

  /** Most recent enrollment summarised into the center-panel info rows. */
  private async enrollment(citizenId: string): Promise<EnrollmentInfo | null> {
    try {
      const result = await this.db.query<{
        event: string | null;
        condition: string | null;
        assignee: string | null;
        status: string | null;
      }>(
        `SELECT ev.event_name AS event,
                cond.condition_code AS condition,
                NULL::text AS assignee,
                e.status AS status
         FROM dinc_runtime.programme_enrolment e
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
         WHERE e.patient_id = $1
         ORDER BY e.created_at DESC
         LIMIT 1`,
        [citizenId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        // CPHC service, review status and remarks are not modelled on the
        // enrollment record, so they are reported as unavailable (never faked).
        service: null,
        event: row.event,
        condition: row.condition,
        assignee: row.assignee,
        priority: null,
        status: row.status,
        reviewStatus: null,
        remarks: null,
      };
    } catch (error) {
      this.logger.warn(`Citizen enrollment query failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async activities(citizenId: string): Promise<ActivityEntry[]> {
    try {
      const result = await this.db.query<{
        id: string;
        activity: string | null;
        program: string | null;
        status: string;
        priority: string;
        due_date: Date | null;
      }>(
        `SELECT ei.event_instance_id AS id,
                COALESCE(act.activity_name, ev.event_name) AS activity,
                pr.programme_name AS program,
                CASE ei.status WHEN 'ACTIVE' THEN 'PENDING' ELSE ei.status END AS status,
                COALESCE(ei.priority, 'NORMAL') AS priority,
                ei.due_date AS due_date
         FROM dinc_runtime.event_instance ei
         JOIN dinc_runtime.programme_enrolment e ON e.enrolment_id = ei.enrolment_id
         LEFT JOIN dinc_metadata.event ev ON ev.event_id = ei.event_id
         LEFT JOIN dinc_metadata.programme pr ON pr.programme_id = e.programme_id
         LEFT JOIN LATERAL (
           SELECT a.activity_name
           FROM dinc_runtime.activity_instance ai
           JOIN dinc_metadata.activity a ON a.activity_id = ai.activity_id
           WHERE ai.event_instance_id = ei.event_instance_id
             AND ai.completed_at IS NULL
           ORDER BY a.display_order
           LIMIT 1
         ) act ON true
         WHERE e.patient_id = $1
         ORDER BY ei.due_date ASC NULLS LAST, ei.created_at DESC
         LIMIT 50`,
        [citizenId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        activity: row.activity,
        program: row.program,
        status: row.status,
        priority: row.priority,
        dueDate: row.due_date ? row.due_date.toISOString() : null,
      }));
    } catch (error) {
      this.logger.warn(`Citizen activities query failed: ${(error as Error).message}`);
      return [];
    }
  }

  private async stats(citizenId: string): Promise<CompletionStats> {
    const empty: CompletionStats = { total: 0, completed: 0, pending: 0 };
    try {
      const result = await this.db.query<{
        total: number;
        completed: number;
        pending: number;
      }>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE ei.status = 'COMPLETED')::int AS completed,
                count(*) FILTER (WHERE ei.status = 'ACTIVE')::int AS pending
         FROM dinc_runtime.event_instance ei
         JOIN dinc_runtime.programme_enrolment e ON e.enrolment_id = ei.enrolment_id
         WHERE e.patient_id = $1`,
        [citizenId],
      );
      return result.rows[0] ?? empty;
    } catch (error) {
      this.logger.warn(`Citizen stats query failed: ${(error as Error).message}`);
      return empty;
    }
  }
}
