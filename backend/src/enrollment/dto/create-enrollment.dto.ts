import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Allowed enrollment lifecycle states (free varchar in the schema; constrained here). */
export const ENROLLMENT_STATUSES = ['ACTIVE', 'INACTIVE', 'COMPLETED'] as const;

/**
 * Request body for POST /api/citizens/:citizenId/enrollments.
 *
 * Only fields backed by real columns are accepted. `disease_id` (the clinical
 * condition) is required because the column is NOT NULL in the schema. The
 * global ValidationPipe (whitelist + forbidNonWhitelisted) rejects anything else.
 */
export class CreateEnrollmentDto {
  @IsUUID('4', { message: 'A valid program must be selected.' })
  programId!: string;

  @IsUUID('4', { message: 'A valid condition must be selected.' })
  diseaseId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'A valid event must be selected.' })
  eventId?: string;

  @IsDateString({}, { message: 'A valid enrollment date is required.' })
  startDate!: string;

  @IsOptional()
  @IsIn(ENROLLMENT_STATUSES, { message: 'Invalid enrollment status.' })
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Remarks must be 2000 characters or fewer.' })
  remarks?: string;
}
