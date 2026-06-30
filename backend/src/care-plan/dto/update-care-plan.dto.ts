import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { CarePlanStatus } from '../care-plan.types';

export class UpdateCarePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Title must be 200 characters or fewer.' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Summary must be 1000 characters or fewer.' })
  summary?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'COMPLETED', 'SUSPENDED'], {
    message: 'Status must be DRAFT, ACTIVE, COMPLETED or SUSPENDED.',
  })
  status?: CarePlanStatus;
}
