import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

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

  /** Responsible role (worklist_items.assigned_role). Set by the Workflow Engine. */
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Assigned role must be 50 characters or fewer.' })
  assignedRole?: string;

  // Validated against the `priority` Reference Data category in ActivityService (M40).
  @IsOptional()
  @IsString()
  priority?: string;
}
