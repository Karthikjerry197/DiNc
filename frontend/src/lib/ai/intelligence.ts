/**
 * Patient Intelligence composer — runs all three engines over one feature
 * vector and blends them into the `PatientIntelligence` contract object.
 *
 * This shape is what a future ML service must return, so keep it stable. The
 * engines are pure, so the composer is pure too (async is added only at the
 * Predictor seam, so the remote path is a drop-in).
 */

import type {
  CareInput,
  DincRiskLevel,
  FollowupInput,
  PatientFeatures,
  PatientIntelligence,
  RiskInput,
} from './types';
import { confidenceResult, nowISO } from './ai-common';
import { predictFollowupDefault } from './followup';
import { computeRisk } from './risk';
import { recommendCare } from './care';

function toRiskInput(f: PatientFeatures): RiskInput {
  return {
    overdueCount: f.overdueCount,
    missedFollowups: f.missedFollowups,
    conditionCount: f.conditions.length,
    severeConditions: f.severeConditions,
    topPriority: f.topPriority,
    escalations: f.escalations,
    nonAdherenceSignals: f.nonAdherenceSignals,
    daysSinceContact: f.daysSinceContact,
    currentRiskLevel: f.currentRiskLevel,
  };
}

function toFollowupInput(f: PatientFeatures): FollowupInput {
  return {
    priorMissed: f.missedFollowups,
    priorReschedules: f.priorReschedules,
    attendanceRate: f.attendanceRate,
    followUpGapDays: f.followUpGapDays,
    chronicConditions: f.chronicConditions,
    age: f.age,
    overdueNow: f.overdueCount > 0,
    daysSinceContact: f.daysSinceContact,
    defaulterSignals: f.defaulterSignals,
  };
}

export function computePatientIntelligence(features: PatientFeatures): PatientIntelligence {
  const risk = computeRisk(toRiskInput(features));
  const followup = predictFollowupDefault(toFollowupInput(features));

  const careInput: CareInput = {
    riskLevel: risk.level,
    riskScore: risk.score,
    followupBand: followup.band,
    followupProbability: followup.probability,
    conditions: features.conditions,
    overdueCount: features.overdueCount,
    missedFollowups: features.missedFollowups,
    nonAdherenceSignals: features.nonAdherenceSignals,
    daysSinceContact: features.daysSinceContact,
    severeConditions: features.severeConditions,
    hasOpenVisit: features.hasOpenVisit,
    hasOpenCall: features.hasOpenCall,
  };
  const care = recommendCare(careInput);

  // Blended confidence = mean of the two engines' data-completeness scores,
  // rendered back through the same labelled wrapper (still capped at 98).
  const blended = Math.round((risk.confidence.value + followup.confidence.value) / 2);
  const confidence = { ...confidenceResult(blended, 100), value: Math.min(98, blended) };
  confidence.level = blended >= 85 ? 'High' : blended >= 68 ? 'Medium' : 'Low';
  confidence.basis = 'Blended across risk & follow-up engines';

  return {
    risk,
    followup,
    care,
    confidence,
    engine: 'rule-based',
    generatedAt: nowISO(),
  };
}

/** Bridge DiNC's clinical category to the explainable RiskBand (display only). */
export function dincLevelToBand(level: DincRiskLevel | null | undefined) {
  switch (level) {
    case 'SEVERE':
      return 'Critical' as const;
    case 'MODERATE':
      return 'Medium' as const;
    case 'LOW':
      return 'Low' as const;
    default:
      return 'Low' as const;
  }
}
