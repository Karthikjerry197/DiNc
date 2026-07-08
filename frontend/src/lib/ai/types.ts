/**
 * DiNC AI Decision-Support Layer — shared contract types.
 *
 * These types are the stable interface between the (currently rule-based)
 * engines and every consumer — the Patient Intelligence Panel, worklist badges,
 * and a future Python ML service reached through `RemotePredictor`. The
 * `PatientIntelligence` shape in particular IS the contract a trained model must
 * one day return, so keep it stable.
 *
 * This module is intentionally pure and dependency-free (no React, no DiNC API
 * imports) so the engines can run in-process in the browser today and be
 * reimplemented in Python later from the very same spec.
 */

export type PredictionEngine = 'rule-based' | 'ml';

/**
 * Explainable risk band used across all three engines. Mapped to — but kept
 * separate from — DiNC's own NONE/LOW/MODERATE/SEVERE clinical category, which
 * is never overwritten.
 */
export type RiskBand = 'Critical' | 'High' | 'Medium' | 'Low';

/** DiNC's authoritative CDSE clinical category (from clinical_alerts). */
export type DincRiskLevel = 'NONE' | 'LOW' | 'MODERATE' | 'SEVERE';

/** Model versions are per-engine so each can be bumped/swapped independently. */
export const MODEL_VERSIONS = {
  risk: 'risk-rules-1.0.0',
  followup: 'followup-rules-1.0.0',
  care: 'care-rules-1.0.0',
} as const;

/** One explainable contribution to a score — carries its own human `reason`. */
export interface PredictionFactor {
  key: string;
  label: string;
  /** Points this factor contributed (already rounded to an integer). */
  points: number;
  /** The maximum this factor could contribute (its weight). */
  max: number;
  /** True when the factor fired (points > 0). */
  active: boolean;
  /** Non-empty human explanation. Required for every active factor. */
  reason: string;
}

export interface PredictionMeta {
  engine: PredictionEngine;
  modelVersion: string;
  generatedAt: string;
}

/** Data-completeness confidence (NOT model certainty). Capped at 98. */
export interface ConfidenceResult {
  value: number;
  level: 'Low' | 'Medium' | 'High';
  /** e.g. "6 of 9 expected signals present". */
  basis: string;
}

/** Urgency guidance derived purely from a risk band. */
export interface RecommendedAction {
  urgency: 'Immediate' | 'Priority' | 'Soon' | 'Routine';
  label: string;
  withinHours: number;
}

// ── Follow-up default engine ────────────────────────────────────────────────

export interface FollowupInput {
  priorMissed: number;
  priorReschedules: number;
  /** Historical attendance rate 0–1, or null when unknown. */
  attendanceRate: number | null;
  /** Days until the next scheduled follow-up, or null when unknown. */
  followUpGapDays: number | null;
  chronicConditions: number;
  age: number | null;
  overdueNow: boolean;
  daysSinceContact: number | null;
  /** Count of derived defaulter signals (no-answer outcomes, escalations, …). */
  defaulterSignals: number;
}

export type FollowupBand = 'Low' | 'Medium' | 'High';

export interface FollowupPriority {
  label: 'Call Today' | 'Call This Week' | 'Routine Outreach';
  rank: 1 | 2 | 3;
}

export interface FollowupResult {
  /** Probability (0–100) of missing the next follow-up. */
  probability: number;
  band: FollowupBand;
  /** All factors, sorted by contribution desc. Points sum EXACTLY to probability. */
  factors: PredictionFactor[];
  priority: FollowupPriority;
  confidence: ConfidenceResult;
  meta: PredictionMeta;
}

// ── Explainable risk engine (0–100) ─────────────────────────────────────────

export interface RiskInput {
  overdueCount: number;
  missedFollowups: number;
  conditionCount: number;
  severeConditions: number;
  /** Highest activity priority seen (URGENT/HIGH/…), or null. */
  topPriority: string | null;
  escalations: number;
  nonAdherenceSignals: number;
  daysSinceContact: number | null;
  /** DiNC's own CDSE category — used only to keep the band consistent. */
  currentRiskLevel: DincRiskLevel | null;
}

export interface RiskResult {
  /** 0–100 explainable score (factor points sum exactly to this). */
  score: number;
  level: RiskBand;
  /** DiNC's authoritative category, passed through untouched (never overwritten). */
  dincLevel: DincRiskLevel | null;
  factors: PredictionFactor[];
  confidence: ConfidenceResult;
  recommended: RecommendedAction;
  modelVersion: string;
}

// ── Care recommendation engine ──────────────────────────────────────────────

export interface CareInput {
  riskLevel: RiskBand;
  riskScore: number;
  followupBand: FollowupBand;
  followupProbability: number;
  conditions: string[];
  overdueCount: number;
  missedFollowups: number;
  nonAdherenceSignals: number;
  daysSinceContact: number | null;
  severeConditions: number;
  hasOpenVisit: boolean;
  hasOpenCall: boolean;
}

/** Deep-link target into DiNC's own guidebooks / knowledge base. */
export interface CareLink {
  kind: 'guidebook' | 'faq';
  label: string;
  /** Search query DiNC's guidebook / knowledge routes already understand. */
  query: string;
}

export type CarePriority = 'High' | 'Medium' | 'Low';

export interface CareRecommendation {
  key: string;
  action: string;
  reason: string;
  priority: CarePriority;
  /** ≥1 supporting signal that justifies the recommendation. */
  factors: string[];
  link?: CareLink;
}

export interface CareResult {
  recommendations: CareRecommendation[];
  /** Highest priority across the emitted recommendations. */
  priority: CarePriority;
}

// ── Unified feature vector + composed intelligence ──────────────────────────

/**
 * The single feature vector produced by the feature builders from DiNC's
 * existing data. Every engine input is derived from this, so a future ML
 * service receives exactly this object.
 */
export interface PatientFeatures {
  age: number | null;
  gender: string | null;
  conditions: string[];
  chronicConditions: number;
  severeConditions: number;
  overdueCount: number;
  missedFollowups: number;
  priorReschedules: number;
  attendanceRate: number | null;
  followUpGapDays: number | null;
  daysSinceContact: number | null;
  escalations: number;
  nonAdherenceSignals: number;
  defaulterSignals: number;
  topPriority: string | null;
  currentRiskLevel: DincRiskLevel | null;
  hasOpenVisit: boolean;
  hasOpenCall: boolean;
  /** True when this vector is the lighter worklist-row approximation. */
  approximate: boolean;
}

/** THE contract shape a future ML model must return. Keep stable. */
export interface PatientIntelligence {
  risk: RiskResult;
  followup: FollowupResult;
  care: CareResult;
  /** Confidence blended across the engines (data completeness, not certainty). */
  confidence: ConfidenceResult;
  engine: PredictionEngine;
  generatedAt: string;
}
