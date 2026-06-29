import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Resolution actions available after approval. */
export const RESOLUTION_ACTIONS = ['MERGE', 'DELETE'] as const;

/**
 * Request body for resolving an approved request — either merging the duplicate
 * into the current patient or deleting the duplicate record. The heavy data
 * migration is intentionally a placeholder for this milestone; the request state
 * machine and audit trail are fully implemented.
 */
export class ResolveDuplicateRequestDto {
  @IsIn(RESOLUTION_ACTIONS, { message: 'Resolution must be MERGE or DELETE.' })
  action!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Remarks must be 2000 characters or fewer.' })
  remarks?: string;
}
