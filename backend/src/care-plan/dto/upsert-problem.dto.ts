import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { ProblemStatus } from '../care-plan.types';

export class UpsertProblemDto {
  @IsString({ message: 'Problem title is required.' })
  @MaxLength(200, { message: 'Title must be 200 characters or fewer.' })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description must be 1000 characters or fewer.' })
  description?: string;

  /** Optional link to a specific programme enrollment for context grouping. */
  @IsOptional()
  @IsUUID('4', { message: 'enrollmentId must be a valid UUID.' })
  enrollmentId?: string;

  /** ISO date YYYY-MM-DD when the problem was identified. Defaults to today. */
  @IsOptional()
  @IsString()
  identifiedDate?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'RESOLVED', 'MONITORING', 'DEFERRED'], {
    message: 'Status must be ACTIVE, RESOLVED, MONITORING or DEFERRED.',
  })
  status?: ProblemStatus;
}
