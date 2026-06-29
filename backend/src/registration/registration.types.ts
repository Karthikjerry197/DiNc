/**
 * Types for the integrated Patient Registration workflow (Milestone 12).
 *
 * Registration is one atomic operation: create the citizen (auto-generating a
 * UHID when needed), enroll into every selected program, and generate each
 * program's initial activity from its first configured event. It reuses the
 * existing data model (citizens, enrollments, events, worklist_items) — no
 * workflow logic is duplicated and the Workflow Rules Engine is untouched.
 */

/** Normalised patient demographics captured by the wizard's Step 1. */
export interface PatientDetailsInput {
  uhid: string | null; // optional; auto-generated when absent
  fullName: string;
  age: number | null;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  village: string | null;
  district: string | null;
  aadhaar: string | null;
}

/** A program selected for enrollment, resolved to its initial clinical context. */
export interface ResolvedProgramTarget {
  programId: string;
  programName: string;
  diseaseId: string;
  eventId: string;
}

/** One option for the wizard's program picker. */
export interface ProgramOption {
  id: string;
  code: string;
  name: string;
}

/** One option for the wizard's worker picker. */
export interface WorkerOption {
  username: string;
  fullName: string;
  role: string;
}

/** Everything the wizard needs to render Steps 2 & 3. */
export interface RegistrationOptionsDto {
  programs: ProgramOption[];
  workers: WorkerOption[];
}

/** A potential duplicate surfaced before registration. */
export interface DuplicateMatch {
  id: string;
  uhid: string;
  fullName: string | null;
  phone: string | null;
  matchedOn: ('UHID' | 'PHONE' | 'AADHAAR')[];
}

export interface DuplicateCheckResult {
  duplicates: DuplicateMatch[];
}

/** Per-program enrollment outcome included in the registration result. */
export interface EnrollmentResultItem {
  programId: string;
  programName: string;
  enrollmentId: string;
  activityId: string | null;
}

/** Result of a successful registration. */
export interface RegistrationResultDto {
  citizenId: string;
  uhid: string;
  fullName: string | null;
  enrollments: EnrollmentResultItem[];
  /** Programs that could not be resolved to an initial event (skipped). */
  skippedPrograms: string[];
}

/** Per-row outcome classification for bulk upload. */
export type BulkRowStatus = 'CREATED' | 'DUPLICATE' | 'SKIPPED' | 'FAILED';

export interface BulkRowResult {
  row: number;
  uhid: string | null;
  fullName: string | null;
  status: BulkRowStatus;
  enrollments: number;
  reason: string | null;
}

export interface BulkRegistrationResultDto {
  total: number;
  created: number;
  duplicate: number;
  skipped: number;
  failed: number;
  rows: BulkRowResult[];
}
