import {
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
 * The worker selects one of the event's configured outcomes (`outcomeTypeId`).
 * What happens next is decided entirely by the Workflow Rules Engine — this DTO
 * carries no lifecycle/branching hints. `clinicalData` is an open key/value map
 * because the clinical fields are defined by the event's outcome template.
 *
 * `generatedNote` and `noteStatus` are 16A additions: if provided, the note is
 * persisted to `consultation_notes` as a FINAL record linked to the outcome.
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

  /** Values for the dynamic clinical form, keyed by field label. */
  @IsOptional()
  @IsObject({ message: 'Clinical data must be an object.' })
  clinicalData?: Record<string, unknown>;

  /** Auto-generated (and optionally edited) consultation note. */
  @IsOptional()
  @IsString()
  generatedNote?: string;

  /** Defaults to FINAL when persisting alongside a saved consultation outcome. */
  @IsOptional()
  @IsIn(['DRAFT', 'FINAL'])
  noteStatus?: 'DRAFT' | 'FINAL';
}
