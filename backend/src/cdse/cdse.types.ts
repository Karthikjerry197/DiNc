/**
 * Clinical Decision Support Engine (CDSE) — shared types.
 *
 * These interfaces define the full contract between the engine, the rule
 * library, and the API response. Nothing clinical is hardcoded here — all
 * rule logic lives in /rules, all data loading lives in /engine.
 */

// ── Recommendation primitives ─────────────────────────────────────────────────

export type RecommendationPriority =
  | 'CRITICAL'
  | 'HIGH'
  | 'RECOMMENDED'
  | 'PREVENTIVE'
  | 'INFORMATION';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

/**
 * A single structured recommendation produced by one clinical rule.
 * Every field is populated by the rule itself — the engine never fills in
 * default values. Healthcare workers see WHAT to do, WHY, and HOW.
 */
export interface CdsRecommendation {
  /** Stable rule identifier; links back to the rule that fired. */
  ruleId: string;
  /** Short action-oriented title (e.g. "Blood Pressure Review Required"). */
  title: string;
  /** One-sentence clinical explanation of why this matters. */
  explanation: string;
  /**
   * The WHY bullets — specific, patient-specific reasons this rule fired.
   * Example: ["Enrolled in Hypertension programme", "Last BP was 47 days ago"].
   * At least one reason is always present.
   */
  reasons: string[];
  /** The recommended next action for the healthcare worker. */
  action: string;
  priority: RecommendationPriority;
  /** Human-readable citation of the clinical protocol behind the rule. */
  supportingRule: string;
}

// ── Clinical context (built from existing tables, no new schema needed) ───────

export interface ActiveProgramInfo {
  enrollmentId: string;
  programName: string;
  diseaseName: string | null;
  /** ISO date string (YYYY-MM-DD). */
  startDate: string | null;
}

export interface OverdueWorklistItem {
  id: string;
  /** ISO date string (YYYY-MM-DD). */
  dueDate: string | null;
  daysOverdue: number;
  status: string;
}

export interface RecentOutcomeDatum {
  /** ISO timestamp of when this consultation was recorded. */
  recordedAt: string;
  /**
   * Parsed outcome_records.data.fields — a Record keyed by field label.
   * Keys are dynamic and template-driven (e.g. "Blood Pressure", "BMI").
   */
  fields: Record<string, unknown>;
  /** The full outcome_records.data JSONB for rules that need raw access. */
  rawData: Record<string, unknown>;
}

/**
 * The complete clinical snapshot for one citizen, assembled from existing
 * tables by ContextLoaderService. No new tables or columns are required.
 * Rules receive this object and must not perform additional DB queries.
 */
export interface ClinicalContext {
  citizen: {
    id: string;
    age: number | null;
    gender: string | null;
  };
  /** All currently ACTIVE programme enrollments. */
  activePrograms: ActiveProgramInfo[];
  /**
   * Worklist items that are PENDING or IN_PROGRESS with a due_date in the past.
   * An empty array means no missed follow-ups.
   */
  overdueWorklist: OverdueWorklistItem[];
  /**
   * Days since the most recent consultation (outcome_recorded_at).
   * null means the citizen has never had a consultation.
   */
  daysSinceLastConsultation: number | null;
  /** Total number of consultations (outcome_records) ever recorded. */
  totalConsultations: number;
  /** Most recent 5 outcome records with their dynamic field data. */
  recentOutcomeData: RecentOutcomeDatum[];
}

// ── API response shape ────────────────────────────────────────────────────────

export interface CdsResponse {
  citizenId: string;
  overallRisk: RiskLevel;
  riskExplanation: string;
  recommendations: CdsRecommendation[];
  /** ISO timestamp of when this evaluation was run. */
  evaluatedAt: string;
  totalActivePrograms: number;
  totalConsultations: number;
}
