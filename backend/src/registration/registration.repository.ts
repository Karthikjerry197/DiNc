import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, TxClient } from '../database/database.service';
import {
  DuplicateMatch,
  EnrollmentResultItem,
  PatientDetailsInput,
  ProgramOption,
  RegistrationResultDto,
  ResolvedProgramTarget,
  WorkerOption,
} from './registration.types';

/**
 * Data-access layer for integrated patient registration. The ONLY place holding
 * registration SQL. The write path runs inside a single transaction
 * (DatabaseService.withTransaction) so registration is atomic — citizen,
 * enrollments and initial activities all commit together or not at all.
 *
 * It reuses the existing data model and insert shapes (citizens, enrollments,
 * worklist_items) rather than duplicating business logic; resolution/validation
 * lives in the service.
 */
@Injectable()
export class RegistrationRepository implements OnModuleInit {
  private readonly logger = new Logger(RegistrationRepository.name);

  constructor(private readonly db: DatabaseService) {}

  /** Adds the optional demographic columns the wizard captures (idempotent). */
  async onModuleInit(): Promise<void> {
    try {
      await this.db.query(
        `ALTER TABLE public.citizens
           ADD COLUMN IF NOT EXISTS aadhaar character varying(20),
           ADD COLUMN IF NOT EXISTS village character varying(120),
           ADD COLUMN IF NOT EXISTS address text,
           ADD COLUMN IF NOT EXISTS date_of_birth date`,
      );
    } catch (error) {
      this.logger.error(`Citizen demographic columns ensure failed: ${(error as Error).message}`);
    }
  }

  // ── Reads (wizard options, resolution, duplicate detection) ────────────────

  async activePrograms(): Promise<ProgramOption[]> {
    const result = await this.db.query<ProgramOption>(
      `SELECT id, code, name FROM public.programs WHERE is_active = true ORDER BY name`,
    );
    return result.rows;
  }

  async activeWorkers(): Promise<WorkerOption[]> {
    const result = await this.db.query<{ username: string; full_name: string; role: string }>(
      `SELECT username, full_name, role FROM public.users WHERE is_active = true
       ORDER BY role, full_name`,
    );
    return result.rows.map((r) => ({ username: r.username, fullName: r.full_name, role: r.role }));
  }

  /**
   * Resolves each selected program to its default disease + initial event (the
   * lowest-sequence active event). Programs that cannot be resolved are returned
   * with null ids so the service can skip them.
   */
  async resolveTargets(
    programIds: string[],
  ): Promise<{ programId: string; programName: string; diseaseId: string | null; eventId: string | null }[]> {
    if (programIds.length === 0) return [];
    const result = await this.db.query<{
      program_id: string;
      program_name: string;
      disease_id: string | null;
      event_id: string | null;
    }>(
      `SELECT p.id AS program_id, p.name AS program_name, t.disease_id, t.event_id
       FROM public.programs p
       LEFT JOIN LATERAL (
         SELECT d.id AS disease_id, ev.id AS event_id
         FROM public.sub_programs sp
         JOIN public.diseases d ON d.sub_program_id = sp.id AND d.is_active = true
         JOIN public.events ev ON ev.disease_id = d.id AND ev.is_active = true
         WHERE sp.program_id = p.id
         ORDER BY d.created_at, ev.sequence
         LIMIT 1
       ) t ON true
       WHERE p.id = ANY($1::uuid[]) AND p.is_active = true`,
      [programIds],
    );
    return result.rows.map((r) => ({
      programId: r.program_id,
      programName: r.program_name,
      diseaseId: r.disease_id,
      eventId: r.event_id,
    }));
  }

  /** Finds existing patients matching any of UHID / phone / Aadhaar. */
  async findDuplicates(
    uhid: string | null,
    phone: string | null,
    aadhaar: string | null,
  ): Promise<DuplicateMatch[]> {
    const result = await this.db.query<{
      id: string;
      uhid: string;
      full_name: string | null;
      phone: string | null;
      m_uhid: boolean;
      m_phone: boolean;
      m_aadhaar: boolean;
    }>(
      `SELECT id, uhid, full_name, phone,
              (COALESCE($1,'') <> '' AND uhid = $1) AS m_uhid,
              (COALESCE($2,'') <> '' AND phone = $2) AS m_phone,
              (COALESCE($3,'') <> '' AND aadhaar = $3) AS m_aadhaar
       FROM public.citizens
       WHERE (COALESCE($1,'') <> '' AND uhid = $1)
          OR (COALESCE($2,'') <> '' AND phone = $2)
          OR (COALESCE($3,'') <> '' AND aadhaar = $3)
       LIMIT 20`,
      [uhid, phone, aadhaar],
    );
    return result.rows.map((r) => {
      const matchedOn: ('UHID' | 'PHONE' | 'AADHAAR')[] = [];
      if (r.m_uhid) matchedOn.push('UHID');
      if (r.m_phone) matchedOn.push('PHONE');
      if (r.m_aadhaar) matchedOn.push('AADHAAR');
      return { id: r.id, uhid: r.uhid, fullName: r.full_name, phone: r.phone, matchedOn };
    });
  }

  // ── Atomic write ───────────────────────────────────────────────────────────

  /**
   * Atomically registers a patient: inserts the citizen (generating a UHID when
   * none supplied), then for each resolved program inserts an enrollment and its
   * initial activity (worklist item). Rolls back entirely on any failure.
   */
  async register(
    details: PatientDetailsInput,
    targets: ResolvedProgramTarget[],
    assignedTo: string | null,
    enrolledBy: string | null,
  ): Promise<RegistrationResultDto> {
    return this.db.withTransaction(async (tx) => {
      const uhid = details.uhid?.trim() || (await RegistrationRepository.nextUhid(tx));

      const citizen = await tx.query<{ id: string }>(
        `INSERT INTO public.citizens
           (uhid, full_name, age, gender, phone, district, aadhaar, village, address, date_of_birth)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (uhid) DO NOTHING
         RETURNING id`,
        [
          uhid,
          details.fullName,
          details.age,
          details.gender,
          details.phone,
          details.district,
          details.aadhaar,
          details.village,
          details.address,
          details.dateOfBirth,
        ],
      );
      const citizenId = citizen.rows[0]?.id;
      if (!citizenId) {
        throw new ConflictException(`A patient with UHID ${uhid} already exists.`);
      }

      const today = new Date().toISOString().slice(0, 10);
      const enrollments: EnrollmentResultItem[] = [];

      for (const target of targets) {
        const enr = await tx.query<{ id: string }>(
          `INSERT INTO public.enrollments
             (citizen_id, program_id, disease_id, current_event_id, start_date, status, assigned_worker, enrolled_by)
           VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6,$7)
           RETURNING id`,
          [citizenId, target.programId, target.diseaseId, target.eventId, today, assignedTo, enrolledBy],
        );
        const enrollmentId = enr.rows[0].id;

        // Initial activity for the program's first event (same shape as
        // ActivityService.insertActivity) — created inside the same transaction.
        const act = await tx.query<{ id: string }>(
          `INSERT INTO public.worklist_items
             (enrollment_id, event_id, program_id, disease_id, assigned_to, due_date, priority, status, version)
           VALUES ($1,$2,$3,$4,$5,$6,'NORMAL','PENDING',1)
           RETURNING id`,
          [enrollmentId, target.eventId, target.programId, target.diseaseId, assignedTo, today],
        );

        enrollments.push({
          programId: target.programId,
          programName: target.programName,
          enrollmentId,
          activityId: act.rows[0]?.id ?? null,
        });
      }

      return {
        citizenId,
        uhid,
        fullName: details.fullName,
        enrollments,
        skippedPrograms: [],
      };
    });
  }

  /** Computes the next sequential UHID (ASSAM-<year>-<5 digits>) inside the tx. */
  private static async nextUhid(tx: TxClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ASSAM-${year}-`;
    const res = await tx.query<{ mx: string | null }>(
      `SELECT max(uhid) AS mx FROM public.citizens WHERE uhid LIKE $1`,
      [`${prefix}%`],
    );
    const max = res.rows[0]?.mx ?? null;
    const lastNum = max ? parseInt(max.slice(prefix.length), 10) : 0;
    const next = (Number.isFinite(lastNum) ? lastNum : 0) + 1;
    return `${prefix}${String(next).padStart(5, '0')}`;
  }
}
