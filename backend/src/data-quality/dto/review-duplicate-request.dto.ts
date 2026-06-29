import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Request body for the approve/reject review actions. Remarks are optional but
 * recorded verbatim into the audit trail when supplied.
 */
export class ReviewDuplicateRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Remarks must be 2000 characters or fewer.' })
  remarks?: string;
}
