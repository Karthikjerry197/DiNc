import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityRepository } from './activity.repository';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ActivityDto, ActivityOptionsDto, ActivityRow } from './activity.types';

/**
 * Business layer for activities. Maps raw rows to DTOs, assembles the dialog
 * options, and validates referential integrity before creating an activity.
 * Contains no SQL.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly repo: ActivityRepository) {}

  async getForEnrollment(enrollmentId: string): Promise<ActivityDto[]> {
    const rows = await this.repo.findByEnrollment(enrollmentId);
    return rows.map((row) => ActivityService.toDto(row));
  }

  async getById(activityId: string): Promise<ActivityDto | null> {
    const row = await this.repo.findById(activityId);
    return row ? ActivityService.toDto(row) : null;
  }

  /** Events (for the enrollment's disease) + assignees + the default event. */
  async getActivityOptions(enrollmentId: string): Promise<ActivityOptionsDto> {
    const enrollment = await this.repo.findEnrollmentCore(enrollmentId);
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found.');
    }
    const [events, assignees] = await Promise.all([
      enrollment.disease_id
        ? this.repo.findEventsByDisease(enrollment.disease_id)
        : Promise.resolve([]),
      this.repo.findAssignableUsers(),
    ]);
    return {
      defaultEventId: enrollment.current_event_id,
      events,
      assignees,
    };
  }

  /**
   * Creates an activity (worklist_items row) linked to the enrollment, its
   * program and disease, and the chosen event. Returns the created activity.
   */
  async createActivity(
    enrollmentId: string,
    dto: CreateActivityDto,
  ): Promise<ActivityDto> {
    const enrollment = await this.repo.findEnrollmentCore(enrollmentId);
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found.');
    }

    const eventDiseaseId = await this.repo.findDiseaseIdForEvent(dto.eventId);
    if (!eventDiseaseId) {
      throw new BadRequestException('Selected event does not exist.');
    }
    if (enrollment.disease_id && eventDiseaseId !== enrollment.disease_id) {
      throw new BadRequestException(
        'Selected event does not belong to this enrollment.',
      );
    }

    const assignedTo = dto.assignedTo?.trim() ? dto.assignedTo.trim() : null;

    const newId = await this.repo.insertActivity({
      enrollmentId,
      eventId: dto.eventId,
      programId: enrollment.program_id,
      diseaseId: enrollment.disease_id,
      assignedTo,
      dueDate: dto.dueDate,
      priority: dto.priority ?? 'NORMAL',
    });
    if (!newId) {
      // The enrollment disappeared between validation and insert — never orphan.
      throw new NotFoundException('Enrollment not found.');
    }

    const created = await this.repo.findById(newId);
    if (!created) {
      // Should never happen — the row was just inserted.
      throw new NotFoundException('Activity could not be loaded after creation.');
    }
    return ActivityService.toDto(created);
  }

  /**
   * Creates the enrollment's first activity automatically (PENDING / NORMAL /
   * unassigned, due today). Idempotent: if an activity already exists for this
   * enrollment + event it is returned instead of creating a duplicate, so a
   * retried enrollment never yields two initial activities.
   */
  async createInitialActivity(params: {
    enrollmentId: string;
    eventId: string;
    programId: string | null;
    diseaseId: string | null;
    dueDate?: string;
  }): Promise<ActivityDto | null> {
    let id = await this.repo.findActivityIdForEnrollmentEvent(
      params.enrollmentId,
      params.eventId,
    );

    if (!id) {
      // Guarded insert: only creates the activity if the enrollment exists.
      id = await this.repo.insertActivity({
        enrollmentId: params.enrollmentId,
        eventId: params.eventId,
        programId: params.programId,
        diseaseId: params.diseaseId,
        assignedTo: null,
        dueDate: params.dueDate ?? new Date().toISOString().slice(0, 10),
        priority: 'NORMAL',
      });
    }

    if (!id) return null;
    const row = await this.repo.findById(id);
    return row ? ActivityService.toDto(row) : null;
  }

  /**
   * Transitions an activity to a new lifecycle state. Reused by start-call and by
   * the Workflow Rules Engine — the Activity module owns activity-state writes so
   * the lifecycle is not duplicated across modules.
   */
  transition(
    activityId: string,
    status: string,
    opts: { complete?: boolean; escalate?: boolean } = {},
  ): Promise<void> {
    return this.repo.updateStatus(
      activityId,
      status,
      opts.complete ?? false,
      opts.escalate ?? false,
    );
  }

  /** Reschedules an activity by pushing its due date forward `days` (stays PENDING). */
  rescheduleDue(activityId: string, days: number): Promise<void> {
    return this.repo.shiftDueDateDays(activityId, days);
  }

  /** Records a contact attempt; returns the new attempt count. */
  recordAttempt(activityId: string): Promise<number> {
    return this.repo.incrementRetry(activityId);
  }

  private static toDto(row: ActivityRow): ActivityDto {
    return {
      id: row.id,
      name: row.activity_name,
      status: row.status,
      priority: row.priority,
      assignedUser: row.assigned_to,
      assignedRole: row.assigned_role,
      dueDate: ActivityService.toIso(row.due_date),
      createdDate: ActivityService.toIso(row.created_at),
      completedDate: ActivityService.toIso(row.completed_at),
      // worklist_items has no remarks column; reported as unavailable, never faked.
      remarks: null,
      event: { id: row.event_id, name: row.event_name },
      enrollmentId: row.enrollment_id,
    };
  }

  private static toIso(value: Date | null): string | null {
    return value ? value.toISOString() : null;
  }
}
