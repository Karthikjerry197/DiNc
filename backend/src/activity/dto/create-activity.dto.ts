import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Allowed worklist priorities (free varchar(8) in the schema; constrained here). */
export const ACTIVITY_PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const;

/**
 * Request body for POST /api/enrollments/:enrollmentId/activities.
 *
 * Only fields backed by real worklist_items columns are accepted. Status is not
 * accepted — new activities always start PENDING. The enrollmentId comes from
 * the URL; program_id and disease_id are derived from the enrollment server-side.
 */
export class CreateActivityDto {
  @IsUUID('4', { message: 'A valid event must be selected.' })
  eventId!: string;

  @IsDateString({}, { message: 'A valid due date is required.' })
  dueDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Assignee must be 100 characters or fewer.' })
  assignedTo?: string;

  @IsOptional()
  @IsIn(ACTIVITY_PRIORITIES, { message: 'Invalid priority.' })
  priority?: string;
}
