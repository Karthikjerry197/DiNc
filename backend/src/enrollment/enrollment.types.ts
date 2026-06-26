/**
 * DTOs for the Program & Enrollment read layer.
 *
 * Every value originates from a SELECT on existing tables. Fields not modelled
 * in the schema (e.g. CPHC service link, review status, remarks) are reported
 * as null so the UI renders professional empty states — nothing is fabricated.
 */

export interface ProgramDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface SubProgramDto {
  id: string;
  name: string;
}

export interface DiseaseDto {
  id: string;
  name: string;
}

export interface EventDto {
  id: string;
  name: string;
}

export interface NamedRef {
  id: string | null;
  name: string | null;
}

export interface EnrollmentSummaryDto {
  id: string;
  program: NamedRef;
  subProgram: NamedRef | null;
  enrollmentDate: string | null;
  status: string;
  priority: string | null;
  cphcService: string | null;
}

export interface EnrollmentDetailDto {
  id: string;
  citizen: { id: string | null; uhid: string | null };
  program: NamedRef;
  subProgram: NamedRef | null;
  condition: string | null;
  event: string | null;
  cphcService: string | null;
  assignee: string | null;
  priority: string | null;
  status: string | null;
  reviewStatus: string | null;
  remarks: string | null;
  enrollmentDate: string | null;
  geographicUnit: string | null;
  enrolledBy: string | null;
}

/** Raw row shapes returned by the repository (snake_case from PostgreSQL). */
export interface ProgramRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface EnrollmentSummaryRow {
  id: string;
  start_date: Date | null;
  status: string;
  priority: string | null;
  program_id: string | null;
  program_name: string | null;
  sub_program_id: string | null;
  sub_program_name: string | null;
}

export interface EnrollmentDetailRow {
  id: string;
  start_date: Date | null;
  status: string;
  assigned_worker: string | null;
  geographic_unit: string | null;
  enrolled_by: string | null;
  priority: string | null;
  citizen_id: string | null;
  uhid: string | null;
  program_id: string | null;
  program_name: string | null;
  sub_program_id: string | null;
  sub_program_name: string | null;
  disease_name: string | null;
  event_name: string | null;
  remarks: string | null;
}

/** Validated input for creating an enrollment (citizenId comes from the URL). */
export interface CreateEnrollmentInput {
  citizenId: string;
  programId: string;
  diseaseId: string;
  eventId: string | null;
  startDate: string;
  status: string;
  remarks: string | null;
  enrolledBy: string | null;
}
