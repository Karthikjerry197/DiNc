/**
 * Explainable risk engine — a 0–100 score that AUGMENTS (never replaces) DiNC's
 * own NONE/LOW/MODERATE/SEVERE CDSE category.
 *
 * Seven hand-weighted factors summing to 100. The score maps to a RiskBand for
 * display, then is reconciled so it never contradicts DiNC's authoritative
 * category (a SEVERE citizen can never read as Low). DiNC's category itself is
 * passed through untouched in `dincLevel`.
 */

import type { PredictionFactor, RiskBand, RiskInput, RiskResult } from './types';
import { MODEL_VERSIONS } from './types';
import { clamp01, confidenceResult, recommendedActionForRisk } from './ai-common';

/** Factor weights (sum = 100). */
const W = {
  overdue: 18,
  missedFollowups: 18,
  severeConditions: 16,
  escalations: 14,
  conditionCount: 12,
  adherenceContact: 12,
  priority: 10,
} as const;

function ramp(x: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  return clamp01((x - lo) / (hi - lo));
}

function bandFromScore(score: number): RiskBand {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
}

const BAND_RANK: Record<RiskBand, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };
const RANK_BAND: RiskBand[] = ['Low', 'Medium', 'High', 'Critical'];

/** Raise `band` to at least `floor` so the display never contradicts a band. */
function atLeast(band: RiskBand, floor: RiskBand): RiskBand {
  return RANK_BAND[Math.max(BAND_RANK[band], BAND_RANK[floor])];
}

/**
 * Keep the band consistent with DiNC's category: SEVERE ⇒ at least High,
 * MODERATE ⇒ at least Medium. We never lower a band to match DiNC — the score's
 * own signals may legitimately read higher than the last CDSE snapshot.
 */
function reconcileWithDinc(band: RiskBand, dinc: RiskInput['currentRiskLevel']): RiskBand {
  if (dinc === 'SEVERE') return atLeast(band, 'High');
  if (dinc === 'MODERATE') return atLeast(band, 'Medium');
  return band;
}

export function computeRisk(input: RiskInput): RiskResult {
  const factors: PredictionFactor[] = [];
  const push = (key: string, label: string, max: number, raw: number, reason: string) => {
    const points = Math.round(Math.max(0, Math.min(max, raw)));
    factors.push({ key, label, points, max, active: points > 0, reason: points > 0 ? reason : '' });
  };

  const dincSevere = input.currentRiskLevel === 'SEVERE';
  const priority = (input.topPriority ?? '').toUpperCase();
  const priorityHot = priority === 'URGENT' || priority === 'HIGH' || priority === 'EMERGENCY';

  push('overdue', 'Overdue activities', W.overdue, W.overdue * ramp(input.overdueCount, 0, 3),
    `${input.overdueCount} overdue ${input.overdueCount === 1 ? 'activity' : 'activities'}`);

  push('missedFollowups', 'Missed follow-ups', W.missedFollowups, W.missedFollowups * ramp(input.missedFollowups, 0, 4),
    `${input.missedFollowups} missed follow-up${input.missedFollowups === 1 ? '' : 's'}`);

  // Severe conditions OR a live SEVERE CDSE category both drive this factor.
  push('severeConditions', 'Severe clinical status', W.severeConditions,
    dincSevere ? W.severeConditions : W.severeConditions * ramp(input.severeConditions, 0, 2),
    dincSevere ? 'Active SEVERE clinical alert' : `${input.severeConditions} severe condition${input.severeConditions === 1 ? '' : 's'}`);

  push('escalations', 'Escalations', W.escalations, W.escalations * ramp(input.escalations, 0, 2),
    `${input.escalations} escalation${input.escalations === 1 ? '' : 's'} on record`);

  push('conditionCount', 'Comorbidity burden', W.conditionCount, W.conditionCount * ramp(input.conditionCount, 1, 4),
    `${input.conditionCount} active condition${input.conditionCount === 1 ? '' : 's'}`);

  // Non-adherence signals or a stale contact both raise engagement risk.
  const staleShare = input.daysSinceContact != null ? ramp(input.daysSinceContact, 30, 90) : 0;
  const adherenceShare = Math.max(ramp(input.nonAdherenceSignals, 0, 2), staleShare);
  push('adherenceContact', 'Adherence / engagement', W.adherenceContact, W.adherenceContact * adherenceShare,
    input.nonAdherenceSignals > 0
      ? `${input.nonAdherenceSignals} non-adherence signal${input.nonAdherenceSignals === 1 ? '' : 's'}`
      : `${input.daysSinceContact} days since last contact`);

  push('priority', 'High-priority activity', W.priority, priorityHot ? W.priority : 0,
    `Top activity priority: ${input.topPriority}`);

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  const level = reconcileWithDinc(bandFromScore(score), input.currentRiskLevel);

  factors.sort((a, b) => b.points - a.points);

  // Coverage over the two nullable-ish signals plus the always-present counts.
  const present =
    6 + (input.daysSinceContact != null ? 1 : 0) + (input.topPriority != null ? 1 : 0);

  return {
    score,
    level,
    dincLevel: input.currentRiskLevel,
    factors,
    confidence: confidenceResult(present, 8),
    recommended: recommendedActionForRisk(level),
    modelVersion: MODEL_VERSIONS.risk,
  };
}
