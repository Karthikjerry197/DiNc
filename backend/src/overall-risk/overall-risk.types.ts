/**
 * Overall Risk Engine — types and the seed Decision Matrix.
 *
 * The Overall Risk of a citizen is a pure function of two INPUTS that already
 * exist in the platform:
 *
 *   1. Clinical Severity  — the CDSE clinical risk category derived from the
 *                           completed consultation's counselling outcomes
 *                           (LOW | MODERATE | SEVERE).
 *   2. AI Follow-up Risk  — the classified band of the explainable follow-up
 *                           default engine's probability (LOW | MODERATE | HIGH).
 *
 * The decision itself is NOT expressed in code. It lives entirely in the
 * `overall_risk_matrix` PostgreSQL table, seeded once from OVERALL_RISK_SEED and
 * thereafter admin-configurable (the seed never clobbers edited rows). The
 * service only LOOKS UP a row — it contains no if/else risk logic.
 */

export type ClinicalSeverity = 'LOW' | 'MODERATE' | 'SEVERE';
export type FollowupRisk = 'LOW' | 'MODERATE' | 'HIGH';
export type OverallRisk = 'LOW' | 'MODERATE' | 'HIGH';

/** A raw row of the decision matrix as stored in PostgreSQL. */
export interface OverallRiskMatrixRow {
  id: string;
  clinical_severity: ClinicalSeverity;
  followup_risk: FollowupRisk;
  overall_risk: OverallRisk;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/** API representation of a matrix row. */
export interface OverallRiskMatrixEntryDto {
  id: string;
  clinicalSeverity: ClinicalSeverity;
  followupRisk: FollowupRisk;
  overallRisk: OverallRisk;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The result of resolving one (severity × follow-up) pair against the matrix. */
export interface OverallRiskResolutionDto {
  /** The normalised inputs actually used for the lookup. */
  clinicalSeverity: ClinicalSeverity;
  followupRisk: FollowupRisk;
  /** The looked-up outcome. */
  overallRisk: OverallRisk;
  /** Human-readable justification, built from the matched row. */
  explanation: string;
  /** True when a matrix row matched; false only if the matrix is incomplete. */
  matched: boolean;
  /** Always 'matrix' — documents that the decision came from the DB, not code. */
  source: 'matrix';
}

/**
 * One batch result: the single-resolve shape plus the caller's `id` so a list can
 * map the answer back to its citizen/row. Same fields as OverallRiskResolutionDto.
 */
export interface OverallRiskBatchResultDto extends OverallRiskResolutionDto {
  id: string;
}

/**
 * The nine authored combinations (Clinical Severity × AI Follow-up Risk → Overall
 * Risk). This is business configuration, seeded once; PostgreSQL is the source of
 * truth after the first boot.
 */
export const OVERALL_RISK_SEED: Array<{
  clinicalSeverity: ClinicalSeverity;
  followupRisk: FollowupRisk;
  overallRisk: OverallRisk;
}> = [
  { clinicalSeverity: 'LOW', followupRisk: 'LOW', overallRisk: 'LOW' },
  { clinicalSeverity: 'LOW', followupRisk: 'MODERATE', overallRisk: 'MODERATE' },
  { clinicalSeverity: 'LOW', followupRisk: 'HIGH', overallRisk: 'HIGH' },
  { clinicalSeverity: 'MODERATE', followupRisk: 'LOW', overallRisk: 'MODERATE' },
  { clinicalSeverity: 'MODERATE', followupRisk: 'MODERATE', overallRisk: 'MODERATE' },
  { clinicalSeverity: 'MODERATE', followupRisk: 'HIGH', overallRisk: 'HIGH' },
  { clinicalSeverity: 'SEVERE', followupRisk: 'LOW', overallRisk: 'HIGH' },
  { clinicalSeverity: 'SEVERE', followupRisk: 'MODERATE', overallRisk: 'HIGH' },
  { clinicalSeverity: 'SEVERE', followupRisk: 'HIGH', overallRisk: 'HIGH' },
];
