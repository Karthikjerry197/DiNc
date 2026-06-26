import { Injectable } from '@nestjs/common';
import { ActivityRepository } from './activity.repository';
import { ActivityDto, ActivityRow } from './activity.types';

/**
 * Business layer for the Activity read feature. Maps raw rows to DTOs. Contains
 * no SQL and performs no writes.
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
