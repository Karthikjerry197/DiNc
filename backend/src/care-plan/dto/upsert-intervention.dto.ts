import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { InterventionStatus } from '../care-plan.types';

export class UpsertInterventionDto {
  @IsString({ message: 'Intervention title is required.' })
  @MaxLength(200, { message: 'Title must be 200 characters or fewer.' })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description must be 1000 characters or fewer.' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  frequency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  responsible?: string;

  @IsOptional()
  @IsIn(['PLANNED', 'ONGOING', 'COMPLETED', 'DISCONTINUED'], {
    message: 'Status must be PLANNED, ONGOING, COMPLETED or DISCONTINUED.',
  })
  status?: InterventionStatus;

  // ── Ownership fields ───────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @MaxLength(100)
  assignedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  assignedTo?: string;

  @IsOptional()
  @IsString()
  dueDate?: string; // ISO date YYYY-MM-DD

  @IsOptional()
  @IsString()
  @MaxLength(100)
  completedBy?: string;

  @IsOptional()
  @IsString()
  completedDate?: string; // ISO date YYYY-MM-DD
}
