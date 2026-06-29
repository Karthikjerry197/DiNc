import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Allowed duplicate reasons. Kept as a small controlled vocabulary so the
 * Administration list and reporting stay consistent; free-form context goes in
 * the optional comments field.
 */
export const DUPLICATE_REASONS = [
  'DUPLICATE_REGISTRATION',
  'SAME_PERSON_DIFFERENT_UHID',
  'DATA_ENTRY_ERROR',
  'MERGED_FAMILY_RECORD',
  'OTHER',
] as const;

/**
 * Request body for POST /api/data-quality/duplicate-requests.
 *
 * The two citizens must be different. The global ValidationPipe
 * (whitelist + forbidNonWhitelisted) rejects any other field.
 */
export class CreateDuplicateRequestDto {
  @IsUUID('4', { message: 'A valid current patient must be selected.' })
  currentCitizenId!: string;

  @IsUUID('4', { message: 'A valid possible duplicate patient must be selected.' })
  duplicateCitizenId!: string;

  @IsIn(DUPLICATE_REASONS, { message: 'Invalid duplicate reason.' })
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Comments must be 2000 characters or fewer.' })
  comments?: string;
}
