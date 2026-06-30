import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { GoalCategory, GoalPriority, GoalStatus } from '../care-plan.types';

export class UpsertGoalDto {
  @IsString({ message: 'Goal title is required.' })
  @MaxLength(200, { message: 'Title must be 200 characters or fewer.' })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description must be 1000 characters or fewer.' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Target value must be 200 characters or fewer.' })
  targetValue?: string;

  @IsOptional()
  @IsString()
  targetDate?: string; // ISO date YYYY-MM-DD

  @IsIn(['CLINICAL', 'LIFESTYLE', 'MEDICATION', 'EDUCATION', 'REFERRAL'], {
    message: 'Category must be CLINICAL, LIFESTYLE, MEDICATION, EDUCATION or REFERRAL.',
  })
  category!: GoalCategory;

  @IsIn(['CRITICAL', 'HIGH', 'ROUTINE'], {
    message: 'Priority must be CRITICAL, HIGH or ROUTINE.',
  })
  priority!: GoalPriority;

  @IsOptional()
  @IsIn(['ACTIVE', 'ACHIEVED', 'PARTIAL', 'NOT_ACHIEVED', 'DEFERRED'], {
    message: 'Status must be ACTIVE, ACHIEVED, PARTIAL, NOT_ACHIEVED or DEFERRED.',
  })
  status?: GoalStatus;

  /** Populated automatically when creating a goal from a CDSE suggestion. */
  @IsOptional()
  @IsString()
  cdseRuleId?: string;
}
