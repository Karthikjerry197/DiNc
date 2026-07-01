/**
 * Clinical Decision Support Engine (CDSE) — types for Milestone 25.
 *
 * The CDSE has ONE responsibility: evaluate the completed consultation
 * and classify the patient's clinical risk into one of four levels.
 * No diagnosis, no AI, no care-plan generation, no disease-specific logic.
 */

// ── New risk model (replaces the old LOW | MODERATE | HIGH) ──────────────────

export type RiskLevel = 'NONE' | 'LOW' | 'MODERATE' | 'SEVERE';

export type ItemCategory =
  | 'DANGER_SIGN'
  | 'REFERRAL_CRITERIA'
  | 'MEDICATION_ADHERENCE'
  | 'LIFESTYLE';

// ── Clinical Alert ────────────────────────────────────────────────────────────

export interface ClinicalAlert {
  id: string;
  citizenId: string;
  activityId: string | null;
  disease: string | null;
  riskLevel: 'MODERATE' | 'SEVERE';
  status: 'ACTIVE' | 'RESOLVED';
  triggeredAt: string;
  resolvedAt: string | null;
}

export interface AlertWithCitizen extends ClinicalAlert {
  citizenName: string | null;
  uhid: string | null;
}

// ── Post-consultation classification result ───────────────────────────────────

export interface RiskClassificationResult {
  citizenId: string;
  activityId: string;
  riskLevel: RiskLevel;
  disease: string | null;
  alert: ClinicalAlert | null;
  evaluatedAt: string;
}

// ── Citizen risk summary (GET /citizens/:id/risk) ────────────────────────────

export interface CitizenRiskSummary {
  citizenId: string;
  riskLevel: RiskLevel;
  disease: string | null;
  evaluatedAt: string | null;
  activeAlert: ClinicalAlert | null;
}

// ── Backward-compat types — kept for Care Plan module integration ─────────────

export type RecommendationPriority =
  | 'CRITICAL'
  | 'HIGH'
  | 'RECOMMENDED'
  | 'PREVENTIVE'
  | 'INFORMATION';

export interface CdsRecommendation {
  ruleId: string;
  title: string;
  explanation: string;
  reasons: string[];
  action: string;
  priority: RecommendationPriority;
  supportingRule: string;
}

export interface CdsResponse {
  citizenId: string;
  overallRisk: 'LOW' | 'MODERATE' | 'HIGH';
  riskExplanation: string;
  recommendations: CdsRecommendation[];
  evaluatedAt: string;
  totalActivePrograms: number;
  totalConsultations: number;
}
