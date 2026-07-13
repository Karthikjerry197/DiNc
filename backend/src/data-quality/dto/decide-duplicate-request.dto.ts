import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/** The three Administrator Review decisions. */
export const DUPLICATE_DECISIONS = [
  'REJECTED',
  'MULTIPLE_ENROLMENT',
  'CONFIRMED_DUPLICATE',
] as const;

/**
 * Request body for the Administrator Review decision (Duplicate Review Workspace).
 * Comments are mandatory for every decision so the audit trail always carries the
 * reviewer's rationale.
 */
export class DecideDuplicateRequestDto {
  @IsIn(DUPLICATE_DECISIONS, {
    message: 'Decision must be REJECTED, MULTIPLE_ENROLMENT or CONFIRMED_DUPLICATE.',
  })
  decision!: (typeof DUPLICATE_DECISIONS)[number];

  @IsString()
  @MinLength(1, { message: 'Comments are required to record a review decision.' })
  @MaxLength(2000, { message: 'Comments must be 2000 characters or fewer.' })
  comments!: string;
}
