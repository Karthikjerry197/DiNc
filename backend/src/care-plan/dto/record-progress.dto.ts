import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { ProgressType } from '../care-plan.types';

export class RecordProgressDto {
  @IsOptional()
  @IsUUID('4', { message: 'goalId must be a valid UUID.' })
  goalId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'worklistItemId must be a valid UUID.' })
  worklistItemId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'outcomeRecordId must be a valid UUID.' })
  outcomeRecordId?: string;

  @IsString({ message: 'Progress note is required.' })
  @MaxLength(4000, { message: 'Progress note must be 4000 characters or fewer.' })
  progressNote!: string;

  @IsIn(['ASSESSMENT', 'UPDATE', 'REVIEW', 'ESCALATION', 'ACHIEVEMENT'], {
    message: 'Progress type must be ASSESSMENT, UPDATE, REVIEW, ESCALATION or ACHIEVEMENT.',
  })
  progressType!: ProgressType;
}
