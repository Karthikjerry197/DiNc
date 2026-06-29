/**
 * Shapes for the Data Quality / Duplicate Request workflow.
 *
 * A duplicate request is the auditable record of a healthcare worker flagging two
 * citizen records as the same person. Workers never delete data — they submit a
 * request; an administrator reviews, approves/rejects, and (optionally) resolves
 * it by merging or deleting the duplicate. Every transition is recorded so nothing
 * is ever silently removed.
 */
import type { CitizenDetail } from '../citizens/citizens.types';
import type {
  EnrollmentSummaryDto,
  NamedRef,
} from '../enrollment/enrollment.types';
import type { GuidebookRef } from '../guidebooks/guidebooks.types';

export type DuplicateRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'RESOLVED';

export type DuplicateResolution = 'MERGED' | 'DELETED';

/** A citizen reference shown on a request row (no clinical detail). */
export interface RequestCitizenRef {
  id: string;
  uhid: string | null;
  fullName: string | null;
}

/** A single duplicate request as shown in the Administration list. */
export interface DuplicateRequestDto {
  id: string;
  /** Human-friendly reference derived from the id (e.g. DR-1A2B3C4D). */
  reference: string;
  currentPatient: RequestCitizenRef;
  duplicatePatient: RequestCitizenRef;
  reason: string;
  comments: string | null;
  status: DuplicateRequestStatus;
  resolution: DuplicateResolution | null;
  submittedBy: string;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  remarks: string | null;
}

/** One patient's full record, assembled by reusing existing read services. */
export interface PatientComparisonSide {
  citizen: CitizenDetail['citizen'];
  programs: NamedRef[];
  enrollments: EnrollmentEntryDto[];
  activities: CitizenDetail['activities'];
  guidebooks: GuidebookRef[];
}

/** An enrollment with its context-aware guidebook (reused resolver). */
export interface EnrollmentEntryDto extends EnrollmentSummaryDto {
  guidebook: GuidebookRef | null;
}

/** Side-by-side comparison payload for the Compare Records dialog. */
export interface DuplicateComparisonDto {
  request: DuplicateRequestDto;
  current: PatientComparisonSide;
  duplicate: PatientComparisonSide;
}

/** Raw row shape returned by the repository (snake_case from PostgreSQL). */
export interface DuplicateRequestRow {
  id: string;
  current_citizen_id: string;
  current_uhid: string | null;
  current_name: string | null;
  duplicate_citizen_id: string;
  duplicate_uhid: string | null;
  duplicate_name: string | null;
  reason: string;
  comments: string | null;
  status: DuplicateRequestStatus;
  resolution: DuplicateResolution | null;
  submitted_by: string;
  submitted_at: Date;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  remarks: string | null;
}

/** Validated input for creating a duplicate request. */
export interface CreateDuplicateRequestInput {
  currentCitizenId: string;
  duplicateCitizenId: string;
  reason: string;
  comments: string | null;
  submittedBy: string;
}
