import { ConflictException, Injectable } from '@nestjs/common';
import { RegistrationRepository } from './registration.repository';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { BulkRegisterDto } from './dto/bulk-register.dto';
import {
  BulkRegistrationResultDto,
  BulkRowResult,
  DuplicateCheckResult,
  PatientDetailsInput,
  RegistrationOptionsDto,
  RegistrationResultDto,
  ResolvedProgramTarget,
} from './registration.types';

/**
 * Orchestrates the single guided registration workflow used everywhere
 * (Dashboard, Citizens, Worklist) and the bulk variant.
 *
 * Single source of truth for: UHID handling, duplicate detection, program →
 * initial-event resolution, and delegation to the atomic repository write. No
 * workflow logic is duplicated; the Workflow Rules Engine is not involved in
 * registration (it acts on consultation outcomes).
 */
@Injectable()
export class RegistrationService {
  constructor(private readonly repo: RegistrationRepository) {}

  async getOptions(): Promise<RegistrationOptionsDto> {
    const [programs, workers] = await Promise.all([
      this.repo.activePrograms(),
      this.repo.activeWorkers(),
    ]);
    return { programs, workers };
  }

  async checkDuplicates(
    uhid: string | undefined,
    phone: string | undefined,
    aadhaar: string | undefined,
  ): Promise<DuplicateCheckResult> {
    const duplicates = await this.repo.findDuplicates(
      uhid?.trim() || null,
      phone?.trim() || null,
      aadhaar?.trim() || null,
    );
    return { duplicates };
  }

  /** Registers one patient atomically. Honours the duplicate guard unless forced. */
  async register(dto: RegisterPatientDto, user: string | null): Promise<RegistrationResultDto> {
    const details = RegistrationService.toDetails(dto);

    if (!dto.force) {
      const { duplicates } = await this.checkDuplicates(
        details.uhid ?? undefined,
        details.phone ?? undefined,
        details.aadhaar ?? undefined,
      );
      if (duplicates.length > 0) {
        throw new ConflictException(
          'A possible duplicate patient already exists. Review the record or confirm to continue.',
        );
      }
    }

    return this.registerOne(details, dto.programIds, dto.assignedTo ?? null, user);
  }

  /** Bulk registration: each row is created + enrolled independently and classified. */
  async bulkRegister(dto: BulkRegisterDto, user: string | null): Promise<BulkRegistrationResultDto> {
    const programs = await this.repo.activePrograms();
    const codeToId = new Map(programs.map((p) => [p.code.toUpperCase(), p.id]));

    const result: BulkRegistrationResultDto = {
      total: dto.patients.length,
      created: 0,
      duplicate: 0,
      skipped: 0,
      failed: 0,
      rows: [],
    };

    for (let i = 0; i < dto.patients.length; i += 1) {
      const raw = dto.patients[i];
      const rowNo = i + 1;
      const details = RegistrationService.bulkRowToDetails(raw);

      // Per-row program resolution: the row's own codes, else the upload defaults.
      const programIds = raw.programs
        ? raw.programs
            .split(/[;,]/)
            .map((c) => codeToId.get(c.trim().toUpperCase()))
            .filter((id): id is string => !!id)
        : dto.defaultProgramIds ?? [];

      try {
        const { duplicates } = await this.checkDuplicates(
          details.uhid ?? undefined,
          details.phone ?? undefined,
          details.aadhaar ?? undefined,
        );
        if (duplicates.length > 0) {
          result.duplicate += 1;
          result.rows.push({
            row: rowNo,
            uhid: details.uhid,
            fullName: details.fullName,
            status: 'DUPLICATE',
            enrollments: 0,
            reason: `Matches existing ${duplicates[0].uhid}`,
          });
          continue;
        }

        const reg = await this.registerOne(details, programIds, dto.assignedTo ?? null, user);
        result.created += 1;
        result.rows.push({
          row: rowNo,
          uhid: reg.uhid,
          fullName: reg.fullName,
          status: 'CREATED',
          enrollments: reg.enrollments.length,
          reason: reg.skippedPrograms.length
            ? `Skipped programs: ${reg.skippedPrograms.join(', ')}`
            : null,
        });
      } catch (error) {
        result.failed += 1;
        result.rows.push({
          row: rowNo,
          uhid: details.uhid,
          fullName: details.fullName,
          status: 'FAILED',
          enrollments: 0,
          reason: (error as Error).message,
        });
      }
    }
    return result;
  }

  /** Shared core: resolve program targets and run the atomic registration. */
  private async registerOne(
    details: PatientDetailsInput,
    programIds: string[],
    assignedTo: string | null,
    user: string | null,
  ): Promise<RegistrationResultDto> {
    const resolved = await this.repo.resolveTargets(programIds);
    const targets: ResolvedProgramTarget[] = [];
    const skipped: string[] = [];
    for (const r of resolved) {
      // Step 5: enrolment proceeds for every resolvable programme; the
      // repository instantiates all initially-active events from metadata
      // (eventId may be null when a programme is fully scheduler-driven).
      if (r.diseaseId) {
        targets.push({
          programId: r.programId,
          programName: r.programName,
          diseaseId: r.diseaseId,
          eventId: r.eventId,
        });
      } else {
        skipped.push(r.programName);
      }
    }

    const result = await this.repo.register(details, targets, assignedTo, user);
    result.skippedPrograms = skipped;
    return result;
  }

  private static toDetails(dto: RegisterPatientDto): PatientDetailsInput {
    const clean = (v?: string): string | null => (v && v.trim() ? v.trim() : null);
    return {
      uhid: clean(dto.uhid),
      fullName: dto.fullName.trim(),
      age: dto.age ?? null,
      dateOfBirth: clean(dto.dateOfBirth),
      gender: clean(dto.gender),
      phone: clean(dto.phone),
      address: clean(dto.address),
      village: clean(dto.village),
      district: clean(dto.district),
      aadhaar: clean(dto.aadhaar),
    };
  }

  private static bulkRowToDetails(row: BulkRegisterDto['patients'][number]): PatientDetailsInput {
    const clean = (v?: string): string | null => (v && v.trim() ? v.trim() : null);
    const ageNum = row.age && row.age.trim() ? Number(row.age) : null;
    return {
      uhid: clean(row.uhid),
      fullName: row.fullName.trim(),
      age: ageNum !== null && Number.isFinite(ageNum) ? ageNum : null,
      dateOfBirth: null,
      gender: clean(row.gender),
      phone: clean(row.phone),
      address: clean(row.address),
      village: clean(row.village),
      district: clean(row.district),
      aadhaar: clean(row.aadhaar),
    };
  }
}
