import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Request body for POST /api/activities/:activityId/consultation.
 *
 * `checkedItemIds` — counselling item IDs the worker explicitly confirmed
 *   during the session (checked checkboxes in the wizard).
 * `counsellingItemIds` — all item IDs that were available during the session
 *   (the complete protocol for this guidebook). Together with checkedItemIds,
 *   the CDSE can determine which items were NOT addressed.
 */
export class SaveConsultationDto {
  @IsUUID('4', { message: 'A valid consultation outcome must be selected.' })
  outcomeTypeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000, { message: 'Clinical notes must be 4000 characters or fewer.' })
  clinicalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000, { message: 'Remarks must be 4000 characters or fewer.' })
  remarks?: string;

  @IsOptional()
  @IsObject({ message: 'Clinical data must be an object.' })
  clinicalData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  generatedNote?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'FINAL'])
  noteStatus?: 'DRAFT' | 'FINAL';

  /** Counselling item IDs the worker confirmed/checked during the session. */
  @IsOptional()
  @IsArray()
  checkedItemIds?: string[];

  /** All counselling item IDs available during the session (full protocol set). */
  @IsOptional()
  @IsArray()
  counsellingItemIds?: string[];
}
