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

  async list(): Promise<CitizenListItem[]> {
    try {
      const result = await this.db.query<{
        id: string;
        uhid: string;
        full_name: string | null;
        age: number | null;
        gender: string | null;
        district: string | null;
      }>(
        `SELECT id, uhid, full_name, age, gender, district
         FROM public.citizens
         ORDER BY created_at DESC
         LIMIT 100`,
      );
      return result.rows.map((row) => ({
        id: row.id,
        uhid: row.uhid,
        fullName: row.full_name,
        age: row.age,
        gender: row.gender,
        district: row.district,
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
        `SELECT id, uhid, full_name, age, gender, phone, district
         FROM public.citizens
         WHERE id = $1
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
        `SELECT DISTINCT p.id, p.name
         FROM public.enrollments e
         JOIN public.programs p ON p.id = e.program_id
         WHERE e.citizen_id = $1
         ORDER BY p.name`,
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
        `SELECT ev.name AS event,
                d.name AS condition,
                e.assigned_worker AS assignee,
                e.status AS status
         FROM public.enrollments e
         LEFT JOIN public.diseases d ON d.id = e.disease_id
         LEFT JOIN public.events ev ON ev.id = e.current_event_id
         WHERE e.citizen_id = $1
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
        `SELECT w.id,
                ev.name AS activity,
                p.name AS program,
                w.status AS status,
                w.priority AS priority,
                w.due_date AS due_date
         FROM public.worklist_items w
         JOIN public.enrollments e ON e.id = w.enrollment_id
         LEFT JOIN public.events ev ON ev.id = w.event_id
         LEFT JOIN public.programs p ON p.id = COALESCE(w.program_id, e.program_id)
         WHERE e.citizen_id = $1
         ORDER BY w.due_date ASC NULLS LAST, w.created_at DESC
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
                count(*) FILTER (WHERE w.status = 'COMPLETED')::int AS completed,
                count(*) FILTER (WHERE w.status = 'PENDING')::int AS pending
         FROM public.worklist_items w
         JOIN public.enrollments e ON e.id = w.enrollment_id
         WHERE e.citizen_id = $1`,
        [citizenId],
      );
      return result.rows[0] ?? empty;
    } catch (error) {
      this.logger.warn(`Citizen stats query failed: ${(error as Error).message}`);
      return empty;
    }
  }
}
