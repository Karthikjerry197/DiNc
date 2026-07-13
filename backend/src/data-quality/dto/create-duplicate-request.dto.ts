import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Request body for POST /api/data-quality/duplicate-requests.
 *
 * The two citizens must be different. The global ValidationPipe
 * (whitelist + forbidNonWhitelisted) rejects any other field. The `reason` is
 * validated against the `duplicate_reason` Reference Data category — the single
 * source of truth (M40) — in DataQualityService, not a hardcoded array here.
 */
export class CreateDuplicateRequestDto {
  @IsUUID('4', { message: 'A valid current patient must be selected.' })
  currentCitizenId!: string;

  @IsUUID('4', { message: 'A valid possible duplicate patient must be selected.' })
  duplicateCitizenId!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Comments must be 2000 characters or fewer.' })
  comments?: string;
}
