import { ConflictException, Injectable, Logger } from '@nestjs/common';
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
 * Data-access layer for integrated patient registration — the first
 * METADATA-DRIVEN write path of the DiNc migration (Step 5).
 *
 * The atomic write (DatabaseService.withTransaction) now creates:
 *   1. dinc_runtime.patient            (uhid→external_id, gender→sex,
 *                                       birth_date from DOB or derived from age)
 *   2. dinc_runtime.programme_enrolment (one per selected programme)
 *   3. dinc_runtime.event_instance      — ONLY the initially-active events:
 *      effective schedule rules (v_schedule_rule_effective, default context)
 *      that are ONE_TIME, anchored on PROGRAMME_REGISTRATION, with no
 *      dependency_event_code and no existence_condition. Due date =
 *      registration_date + offset_days. No future/recurring/BIRTH_DATE-anchored
 *      events are created here — that is the scheduler's job (Step 6).
 *   4. dinc_runtime.activity_instance   — one PENDING row per metadata activity
 *      of each instantiated event.
 *
 * dinc_metadata is read-only. All statements are parameterised.
 */
@Injectable()
export class RegistrationRepository {
  private readonly logger = new Logger(RegistrationRepository.name);

  constructor(private readonly db: DatabaseService) {}

  // ── Reads (wizard options, resolution, duplicate detection) ────────────────

  async activePrograms(): Promise<ProgramOption[]> {
    const result = await this.db.query<ProgramOption>(
      `SELECT programme_id AS id, programme_code AS code, programme_name AS name
       FROM dinc_metadata.programme
       ORDER BY display_order, programme_name`,
    );
    return result.rows;
  }

  async activeWorkers(): Promise<WorkerOption[]> {
    const result = await this.db.query<{ username: string; full_name: string; role: string }>(
      `SELECT username, full_name, role
       FROM dinc_security.app_user
       WHERE is_active = true
       ORDER BY role, full_name`,
    );
    return result.rows.map((r) => ({ username: r.username, fullName: r.full_name, role: r.role }));
  }

  /**
   * Resolves each selected programme against the metadata. The Step-2 shim
   * applies: diseaseId mirrors the programme id. eventId reports the first
   * initially-active event (or null when the programme has none — enrolment
   * still proceeds; its events will come from the scheduler in Step 6).
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
      `SELECT p.programme_id AS program_id,
              p.programme_name AS program_name,
              p.programme_id AS disease_id,
              t.event_id
       FROM dinc_metadata.programme p
       LEFT JOIN LATERAL (
         SELECT v.event_id
         FROM dinc_metadata.v_schedule_rule_effective v
         JOIN dinc_metadata.event e ON e.event_id = v.event_id
         WHERE e.programme_id = p.programme_id
           AND v.schedule_type = 'ONE_TIME'
           AND v.anchor_type = 'PROGRAMME_REGISTRATION'
           AND v.dependency_event_code IS NULL
           AND v.existence_condition IS NULL
           AND v.condition_context IS NULL
         ORDER BY e.display_order
         LIMIT 1
       ) t ON true
       WHERE p.programme_id = ANY($1::uuid[])`,
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
      `SELECT patient_id AS id, external_id AS uhid, full_name, phone,
              (COALESCE($1,'') <> '' AND external_id = $1) AS m_uhid,
              (COALESCE($2,'') <> '' AND phone = $2) AS m_phone,
              (COALESCE($3,'') <> '' AND aadhaar = $3) AS m_aadhaar
       FROM dinc_runtime.patient
       WHERE (COALESCE($1,'') <> '' AND external_id = $1)
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
   * Atomically registers a patient: inserts the patient (generating an
   * external id when none supplied), then for each programme inserts a
   * programme_enrolment, the initially-active event_instance rows derived from
   * the schedule-rule metadata, and their activity_instance rows.
   * Rolls back entirely on any failure.
   */
  async register(
    details: PatientDetailsInput,
    targets: ResolvedProgramTarget[],
    assignedTo: string | null,
    enrolledBy: string | null,
  ): Promise<RegistrationResultDto> {
    void enrolledBy; // no enrolled_by column on programme_enrolment (see analysis §3d)
    return this.db.withTransaction(async (tx) => {
      const uhid = details.uhid?.trim() || (await RegistrationRepository.nextUhid(tx));

      // gender → sex (NOT NULL, CHECK FEMALE|MALE|OTHER). Unknown → OTHER.
      const sex = RegistrationRepository.toSex(details.gender);
      // birth_date: explicit DOB wins; otherwise derived from age so the
      // derived-age reads (Step 3) stay correct. Null when neither is known.
      const birthDateExpr = details.dateOfBirth
        ? { sql: `$4::date`, param: details.dateOfBirth as string | number | null }
        : details.age !== null
          ? { sql: `(CURRENT_DATE - make_interval(years => $4::int))::date`, param: details.age as string | number | null }
          : { sql: `NULLIF($4, '')::date`, param: '' as string | number | null };

      const patient = await tx.query<{ id: string }>(
        `INSERT INTO dinc_runtime.patient
           (external_id, full_name, sex, birth_date, phone, address, district, village, aadhaar, is_active)
         VALUES ($1, $2, $3, ${birthDateExpr.sql}, $5, $6, $7, $8, $9, true)
         ON CONFLICT (external_id) DO NOTHING
         RETURNING patient_id AS id`,
        [
          uhid,
          details.fullName,
          sex,
          birthDateExpr.param,
          details.phone,
          details.address,
          details.district,
          details.village,
          details.aadhaar,
        ],
      );
      const patientId = patient.rows[0]?.id;
      if (!patientId) {
        throw new ConflictException(`A patient with UHID ${uhid} already exists.`);
      }

      // Resolve the assigned worker's user id once (assignment lives on the
      // event_instance — the Step 0 additive column — not on the enrolment).
      const workerId = assignedTo
        ? ((
            await tx.query<{ user_id: string }>(
              `SELECT user_id FROM dinc_security.app_user
               WHERE username = $1 AND is_active = true LIMIT 1`,
              [assignedTo],
            )
          ).rows[0]?.user_id ?? null)
        : null;

      const enrollments: EnrollmentResultItem[] = [];

      for (const target of targets) {
        const enr = await tx.query<{ id: string }>(
          `INSERT INTO dinc_runtime.programme_enrolment
             (patient_id, programme_id, registration_date, status)
           VALUES ($1, $2, CURRENT_DATE, 'ACTIVE')
           RETURNING enrolment_id AS id`,
          [patientId, target.programId],
        );
        const enrollmentId = enr.rows[0].id;

        // METADATA-DRIVEN INSTANTIATION: initially-active events only —
        // ONE_TIME rules anchored on PROGRAMME_REGISTRATION with no dependency
        // and no existence condition, in the default (unconditional) context.
        const created = await tx.query<{ id: string }>(
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
           JOIN dinc_metadata.event e ON e.event_id = v.event_id
           WHERE e.programme_id = $2
             AND v.schedule_type = 'ONE_TIME'
             AND v.anchor_type = 'PROGRAMME_REGISTRATION'
             AND v.dependency_event_code IS NULL
             AND v.existence_condition IS NULL
             AND v.condition_context IS NULL
           ORDER BY e.display_order
           RETURNING event_instance_id AS id`,
          [enrollmentId, target.programId, workerId],
        );

        // One PENDING activity_instance per metadata activity of each event.
        if (created.rows.length > 0) {
          await tx.query(
            `INSERT INTO dinc_runtime.activity_instance
               (event_instance_id, activity_id, status)
             SELECT ei.event_instance_id, a.activity_id, 'PENDING'
             FROM dinc_runtime.event_instance ei
             JOIN dinc_metadata.activity a ON a.event_id = ei.event_id
             WHERE ei.event_instance_id = ANY($1::uuid[])`,
            [created.rows.map((r) => r.id)],
          );
        }

        enrollments.push({
          programId: target.programId,
          programName: target.programName,
          enrollmentId,
          activityId: created.rows[0]?.id ?? null,
        });
      }

      return {
        citizenId: patientId,
        uhid,
        fullName: details.fullName,
        enrollments,
        skippedPrograms: [],
      };
    });
  }

  /** Maps free-text gender input onto the patient.sex CHECK vocabulary. */
  private static toSex(gender: string | null): 'FEMALE' | 'MALE' | 'OTHER' {
    const g = (gender ?? '').trim().toUpperCase();
    if (g.startsWith('F')) return 'FEMALE';
    if (g.startsWith('M')) return 'MALE';
    return 'OTHER';
  }

  /** Computes the next sequential external id (ASSAM-<year>-<5 digits>) inside the tx. */
  private static async nextUhid(tx: TxClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ASSAM-${year}-`;
    const res = await tx.query<{ mx: string | null }>(
      `SELECT max(external_id) AS mx FROM dinc_runtime.patient WHERE external_id LIKE $1`,
      [`${prefix}%`],
    );
    const max = res.rows[0]?.mx ?? null;
    const lastNum = max ? parseInt(max.slice(prefix.length), 10) : 0;
    const next = (Number.isFinite(lastNum) ? lastNum : 0) + 1;
    return `${prefix}${String(next).padStart(5, '0')}`;
  }
}
