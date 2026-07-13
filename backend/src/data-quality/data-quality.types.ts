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

/**
 * Request lifecycle.
 *
 * The Administrator Review Workspace drives PENDING → one of the three review
 * outcomes:
 *   • REJECTED            — not a duplicate.
 *   • CLOSED              — valid multiple-programme enrolment (not a duplicate).
 *   • CONFIRMED_DUPLICATE — confirmed the same person; awaiting the FUTURE
 *                           archive/merge milestone (no data is moved yet).
 *
 * APPROVED / RESOLVED are retained for backward compatibility with the earlier
 * approve→merge/delete flow and any rows already in those states; the new
 * workspace never produces them.
 */
export type DuplicateRequestStatus =
  | 'PENDING'
  | 'REJECTED'
  | 'CLOSED'
  | 'CONFIRMED_DUPLICATE'
  | 'APPROVED'
  | 'RESOLVED';

/** The administrator's review decision (maps 1:1 to a resulting status). */
export type DuplicateDecision =
  | 'REJECTED'
  | 'MULTIPLE_ENROLMENT'
  | 'CONFIRMED_DUPLICATE';

/** Decision → resulting status. Single source of truth for the mapping. */
export const DECISION_STATUS: Record<DuplicateDecision, DuplicateRequestStatus> = {
  REJECTED: 'REJECTED',
  MULTIPLE_ENROLMENT: 'CLOSED',
  CONFIRMED_DUPLICATE: 'CONFIRMED_DUPLICATE',
};

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
  /** The review decision taken (null while PENDING). */
  decision: DuplicateDecision | null;
  resolution: DuplicateResolution | null;
  submittedBy: string;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** Administrator's comments recorded with the decision. */
  reviewComments: string | null;
  /**
   * Legacy alias of reviewComments, kept so pre-existing consumers keep working
   * (falls back to the old `remarks` column for rows created before this change).
   */
  remarks: string | null;
  /** Administrative audit fields. */
  updatedAt: string;
}

/** A single entry in a request's append-only status timeline. */
export interface StatusHistoryEntry {
  id: string;
  fromStatus: DuplicateRequestStatus | null;
  toStatus: DuplicateRequestStatus;
  decision: DuplicateDecision | null;
  comments: string | null;
  actor: string | null;
  createdAt: string;
}

/** Extended demographics for the comparison (reused from the citizens table). */
export interface PatientDemographics {
  uhid: string | null;
  /** ABHA (Ayushman Bharat Health Account) — not yet captured; always null for now. */
  abha: string | null;
  aadhaar: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  age: number | null;
  gender: string | null;
  mobile: string | null;
  address: string | null;
  village: string | null;
  district: string | null;
}

/** An active clinical alert shown under Clinical Information. */
export interface AlertEntryDto {
  id: string;
  disease: string | null;
  riskLevel: string | null;
  status: string;
  triggeredAt: string | null;
}

/** One patient's full record, assembled by reusing existing read services. */
export interface PatientComparisonSide {
  citizen: CitizenDetail['citizen'];
  /** Extended identity/contact fields (UHID, ABHA, Aadhaar, DOB, address, …). */
  demographics: PatientDemographics;
  programs: NamedRef[];
  enrollments: EnrollmentEntryDto[];
  activities: CitizenDetail['activities'];
  /** Active clinical alerts (Clinical Information section). */
  alerts: AlertEntryDto[];
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
  /** Append-only status timeline (newest last) for the request. */
  statusHistory: StatusHistoryEntry[];
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
  decision: DuplicateDecision | null;
  resolution: DuplicateResolution | null;
  submitted_by: string;
  submitted_at: Date;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_comments: string | null;
  remarks: string | null;
  updated_at: Date;
}

/** Raw status-history row (snake_case from PostgreSQL). */
export interface StatusHistoryRow {
  id: string;
  from_status: DuplicateRequestStatus | null;
  to_status: DuplicateRequestStatus;
  decision: DuplicateDecision | null;
  comments: string | null;
  actor: string | null;
  created_at: Date;
}

/** Validated input for creating a duplicate request. */
export interface CreateDuplicateRequestInput {
  currentCitizenId: string;
  duplicateCitizenId: string;
  reason: string;
  comments: string | null;
  submittedBy: string;
}
