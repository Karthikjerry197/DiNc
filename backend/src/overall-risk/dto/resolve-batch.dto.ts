import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, ValidateNested } from 'class-validator';

/** One (citizen id × severity × follow-up) tuple to resolve. */
export class OverallRiskItemDto {
  /** Caller-owned identifier (e.g. citizenId) echoed back on the result. */
  @IsString()
  id!: string;

  /** CDSE category: NONE | LOW | MODERATE | SEVERE (normalised server-side). */
  @IsString()
  clinicalSeverity!: string;

  /** Follow-up band: LOW | MEDIUM/MODERATE | HIGH (normalised server-side). */
  @IsString()
  followupRisk!: string;
}

/**
 * Request body for POST /api/overall-risk/resolve-batch. Bounded so a single
 * request can never ask for an unreasonable number of resolutions.
 */
export class ResolveBatchDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => OverallRiskItemDto)
  items!: OverallRiskItemDto[];
}
