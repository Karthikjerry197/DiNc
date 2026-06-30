import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { CdseDecision } from '../care-plan.types';

export class CdseDecisionEntryDto {
  @IsString({ message: 'cdseRuleId is required.' })
  cdseRuleId!: string;

  @IsString({ message: 'recommendationTitle is required.' })
  @MaxLength(300)
  recommendationTitle!: string;

  @IsIn(['ACCEPTED', 'DECLINED'], {
    message: 'decision must be ACCEPTED or DECLINED.',
  })
  decision!: CdseDecision;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Decline reason must be 500 characters or fewer.' })
  declineReason?: string;

  /** For ACCEPTED decisions: the problem under which to create the goal. */
  @IsOptional()
  @IsUUID('4', { message: 'problemId must be a valid UUID.' })
  problemId?: string;
}

export class BulkCdseDecisionsDto {
  @IsArray({ message: 'decisions must be an array.' })
  @ValidateNested({ each: true })
  @Type(() => CdseDecisionEntryDto)
  decisions!: CdseDecisionEntryDto[];
}
