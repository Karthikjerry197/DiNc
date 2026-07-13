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
  EventActivityDto,
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

  /**
   * Resolves the guidebook(s) matching an enrollment's programme/disease/event
   * via the configurable guidebook_mappings table (with a curated-text-rule
   * fallback). Returns the primary guidebook plus any related ones, or a friendly
   * message when nothing is mapped.
   */
  async getGuidebookForEnrollment(
    enrollmentId: string,
  ): Promise<EnrollmentGuidebookDto> {
    const ctx = await this.repo.findEnrollmentContext(enrollmentId);
    if (ctx === null) {
      throw new NotFoundException('Enrollment not found.');
    }
    return this.guidebooks.resolveForContext(ctx);
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

  /** Activities under an event (DiNc metadata hierarchy, Step 2). */
  getActivities(eventId: string): Promise<EventActivityDto[]> {
    return this.repo.findActivitiesByEvent(eventId);
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
      assignedTo: dto.assignedTo?.trim() ? dto.assignedTo.trim() : null,
    });

    // Automatically create the enrollment's first activity for the selected
    // event, assigned immediately via the single M31 resolver (the enrollment's
    // stored worker + their role — same behaviour as registration and the
    // Workflow Engine). Skipped when no event was chosen (worklist_items.event_id
    // is NOT NULL, so an activity requires an event). Idempotent in the activity layer.
    let activity = null;
    if (dto.eventId) {
      const assignee = await this.activities.resolveEnrollmentAssignee(newId);
      activity = await this.activities.createInitialActivity({
        enrollmentId: newId,
        eventId: dto.eventId,
        programId: dto.programId,
        diseaseId: dto.diseaseId,
        assignedTo: assignee.assignedWorker,
        assignedRole: assignee.workerRole,
      });
    }

    const created = await this.repo.findEnrollmentById(newId);
    if (!created) {
      // Should never happen — the row was just inserted.
      throw new NotFoundException('Enrollment could not be loaded after creation.');
    }
    return { enrollment: this.toDetail(created), activity };
  }

  /** Advances an enrollment's current event (care-plan progression). */
  advanceToEvent(enrollmentId: string, eventId: string): Promise<void> {
    return this.repo.advanceCurrentEvent(enrollmentId, eventId);
  }

  /** Updates an enrollment's lifecycle status. */
  setStatus(enrollmentId: string, status: string): Promise<void> {
    return this.repo.setStatus(enrollmentId, status);
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
