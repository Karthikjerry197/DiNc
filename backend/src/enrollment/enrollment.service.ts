import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentRepository } from './enrollment.repository';
import { ActivityService } from '../activity/activity.service';
import { GuidebooksService } from '../guidebooks/guidebooks.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import {
  CreateEnrollmentResultDto,
  DiseaseDto,
  EnrollmentDetailDto,
  EnrollmentDetailRow,
  EnrollmentGuidebookDto,
  EnrollmentSummaryDto,
  EnrollmentSummaryRow,
  EventDto,
  ProgramDto,
  SubProgramDto,
} from './enrollment.types';

/**
 * Business layer for Program & Enrollment reads. Maps raw repository rows to the
 * DTOs consumed by the frontend. Contains no SQL and performs no writes.
 */
@Injectable()
export class EnrollmentService {
  constructor(
    private readonly repo: EnrollmentRepository,
    private readonly activities: ActivityService,
    private readonly guidebooks: GuidebooksService,
  ) {}

  /** Resolves the guidebook matching an enrollment's program/disease/event. */
  async getGuidebookForEnrollment(
    enrollmentId: string,
  ): Promise<EnrollmentGuidebookDto> {
    const haystack = await this.repo.findEnrollmentHaystack(enrollmentId);
    if (haystack === null) {
      throw new NotFoundException('Enrollment not found.');
    }
    const guidebook = await this.guidebooks.matchByText(haystack);
    return { guidebook };
  }

  async getActivePrograms(): Promise<ProgramDto[]> {
    const rows = await this.repo.findActivePrograms();
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
    }));
  }

  async getEnrollmentsForCitizen(citizenId: string): Promise<EnrollmentSummaryDto[]> {
    const rows = await this.repo.findEnrollmentsByCitizen(citizenId);
    return rows.map((row) => this.toSummary(row));
  }

  async getEnrollmentById(id: string): Promise<EnrollmentDetailDto | null> {
    const row = await this.repo.findEnrollmentById(id);
    return row ? this.toDetail(row) : null;
  }

  getSubPrograms(programId: string): Promise<SubProgramDto[]> {
    return this.repo.findSubProgramsByProgram(programId);
  }

  getDiseases(subProgramId: string): Promise<DiseaseDto[]> {
    return this.repo.findDiseasesBySubProgram(subProgramId);
  }

  getEvents(diseaseId: string): Promise<EventDto[]> {
    return this.repo.findEventsByDisease(diseaseId);
  }

  /**
   * Creates a new enrollment after validating referential integrity and the
   * "no duplicate active enrollment per program" business rule. Returns the
   * full detail of the created enrollment.
   */
  async createEnrollment(
    citizenId: string,
    dto: CreateEnrollmentDto,
    enrolledBy: string | null,
  ): Promise<CreateEnrollmentResultDto> {
    if (!(await this.repo.citizenExists(citizenId))) {
      throw new NotFoundException('Citizen not found.');
    }
    if (!(await this.repo.isProgramActive(dto.programId))) {
      throw new BadRequestException('Selected program does not exist or is inactive.');
    }

    const diseaseProgramId = await this.repo.findProgramIdForDisease(dto.diseaseId);
    if (!diseaseProgramId) {
      throw new BadRequestException('Selected condition does not exist.');
    }
    if (diseaseProgramId !== dto.programId) {
      throw new BadRequestException(
        'Selected condition does not belong to the selected program.',
      );
    }

    // The event is optional, but when provided it must belong to the condition.
    if (dto.eventId) {
      const eventDiseaseId = await this.repo.findDiseaseIdForEvent(dto.eventId);
      if (!eventDiseaseId) {
        throw new BadRequestException('Selected event does not exist.');
      }
      if (eventDiseaseId !== dto.diseaseId) {
        throw new BadRequestException(
          'Selected event does not belong to the selected condition.',
        );
      }
    }

    if (await this.repo.hasActiveEnrollment(citizenId, dto.programId)) {
      throw new ConflictException(
        'An active enrollment already exists for this citizen and program.',
      );
    }

    const newId = await this.repo.insertEnrollment({
      citizenId,
      programId: dto.programId,
      diseaseId: dto.diseaseId,
      eventId: dto.eventId ?? null,
      startDate: dto.startDate,
      status: dto.status ?? 'ACTIVE',
      remarks: dto.remarks?.trim() ? dto.remarks.trim() : null,
      enrolledBy,
    });

    // Automatically create the enrollment's first activity for the selected
    // event. Skipped when no event was chosen (worklist_items.event_id is NOT
    // NULL, so an activity requires an event). Idempotent in the activity layer.
    let activity = null;
    if (dto.eventId) {
      activity = await this.activities.createInitialActivity({
        enrollmentId: newId,
        eventId: dto.eventId,
        programId: dto.programId,
        diseaseId: dto.diseaseId,
      });
    }

    const created = await this.repo.findEnrollmentById(newId);
    if (!created) {
      // Should never happen — the row was just inserted.
      throw new NotFoundException('Enrollment could not be loaded after creation.');
    }
    return { enrollment: this.toDetail(created), activity };
  }

  private toSummary(row: EnrollmentSummaryRow): EnrollmentSummaryDto {
    return {
      id: row.id,
      program: { id: row.program_id, name: row.program_name },
      subProgram: row.sub_program_id
        ? { id: row.sub_program_id, name: row.sub_program_name }
        : null,
      enrollmentDate: EnrollmentService.toIso(row.start_date),
      status: row.status,
      priority: row.priority,
      // No FK links an enrollment to a CPHC service in the schema.
      cphcService: null,
    };
  }

  private toDetail(row: EnrollmentDetailRow): EnrollmentDetailDto {
    return {
      id: row.id,
      citizen: { id: row.citizen_id, uhid: row.uhid },
      program: { id: row.program_id, name: row.program_name },
      subProgram: row.sub_program_id
        ? { id: row.sub_program_id, name: row.sub_program_name }
        : null,
      condition: row.disease_name,
      event: row.event_name,
      // The following are not modelled on the enrollment record — reported as
      // unavailable rather than fabricated.
      cphcService: null,
      assignee: row.assigned_worker,
      priority: row.priority,
      status: row.status,
      reviewStatus: null,
      remarks: row.remarks,
      enrollmentDate: EnrollmentService.toIso(row.start_date),
      geographicUnit: row.geographic_unit,
      enrolledBy: row.enrolled_by,
    };
  }

  private static toIso(value: Date | null): string | null {
    return value ? value.toISOString() : null;
  }
}
