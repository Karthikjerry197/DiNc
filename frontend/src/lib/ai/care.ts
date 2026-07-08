/**
 * Care recommendation engine — per-citizen "next best actions".
 *
 * Emits each rule that applies, then sorts High → Low. Every recommendation
 * carries a human `reason` and ≥1 supporting `factor`. Links deep into DiNC's
 * OWN guidebooks / knowledge base via search queries those routes already
 * understand — this engine never builds a parallel action list that duplicates
 * DiNC's workflow.
 */

import type {
  CareInput,
  CarePriority,
  CareRecommendation,
  CareResult,
} from './types';

/** Tunable config knobs (spec §3.3). */
export const CARE_CONFIG = {
  urgentOutreachProbability: 60,
  staleContactDays: 45,
} as const;

const HYPERTENSION_RE = /hypertension|htn|blood pressure|\bbp\b|\bhtn\b/i;
const DIABETES_RE = /diabet|\bdm\b|blood sugar|glucose|glyca?emic/i;

const PRIORITY_RANK: Record<CarePriority, number> = { High: 0, Medium: 1, Low: 2 };

export function recommendCare(input: CareInput): CareResult {
  const recs: CareRecommendation[] = [];

  const conditionsText = input.conditions.join(' ');
  const isCritical = input.riskLevel === 'Critical';
  const urgentFollowup =
    input.followupBand === 'High' ||
    input.followupProbability >= CARE_CONFIG.urgentOutreachProbability;
  const stale =
    input.daysSinceContact != null && input.daysSinceContact >= CARE_CONFIG.staleContactDays;
  const veryStale =
    input.daysSinceContact != null &&
    input.daysSinceContact >= CARE_CONFIG.staleContactDays * 2;

  // call-today — high follow-up default OR stale contact.
  if (urgentFollowup || stale) {
    recs.push({
      key: 'call-today',
      action: 'Call the citizen today',
      reason: urgentFollowup
        ? `High follow-up default risk (${input.followupProbability}%).`
        : `No contact in ${input.daysSinceContact} days.`,
      priority: 'High',
      factors: [
        ...(urgentFollowup ? [`Follow-up default ${input.followupProbability}%`] : []),
        ...(stale ? [`${input.daysSinceContact} days since contact`] : []),
      ],
    });
  }

  // home-visit — critical risk + non-adherence / very stale contact.
  if (isCritical && (input.nonAdherenceSignals > 0 || veryStale)) {
    recs.push({
      key: 'home-visit',
      action: 'Arrange a home visit',
      reason: 'Critical risk with non-adherence or a very stale contact.',
      priority: 'High',
      factors: [
        `Risk: ${input.riskLevel} (${input.riskScore})`,
        ...(input.nonAdherenceSignals > 0 ? [`${input.nonAdherenceSignals} non-adherence signal(s)`] : []),
        ...(veryStale ? [`${input.daysSinceContact} days since contact`] : []),
      ],
    });
  }

  // medication-counselling — non-adherence signals present.
  if (input.nonAdherenceSignals > 0) {
    recs.push({
      key: 'medication-counselling',
      action: 'Reinforce medication adherence counselling',
      reason: `${input.nonAdherenceSignals} non-adherence signal(s) detected.`,
      priority: isCritical ? 'High' : 'Medium',
      factors: [`${input.nonAdherenceSignals} non-adherence signal(s)`],
      link: { kind: 'guidebook', label: 'Medication adherence guidebook', query: 'medication adherence' },
    });
  }

  // bp-review — conditions match hypertension.
  if (HYPERTENSION_RE.test(conditionsText)) {
    recs.push({
      key: 'bp-review',
      action: 'Schedule a blood-pressure review',
      reason: 'Hypertension present in the citizen’s conditions.',
      priority: 'Medium',
      factors: ['Hypertension in conditions'],
      link: { kind: 'guidebook', label: 'Hypertension guidebook', query: 'hypertension' },
    });
  }

  // diet-counselling — conditions match diabetes.
  if (DIABETES_RE.test(conditionsText)) {
    recs.push({
      key: 'diet-counselling',
      action: 'Provide diet & glycaemic counselling',
      reason: 'Diabetes present in the citizen’s conditions.',
      priority: 'Medium',
      factors: ['Diabetes in conditions'],
      link: { kind: 'guidebook', label: 'Diabetes guidebook', query: 'diabetes' },
    });
  }

  // physician-review — critical risk OR multiple severe conditions.
  if (isCritical || input.severeConditions >= 2) {
    recs.push({
      key: 'physician-review',
      action: 'Escalate for physician review',
      reason: isCritical
        ? `Critical composite risk (${input.riskScore}).`
        : `${input.severeConditions} severe conditions present.`,
      priority: 'High',
      factors: [
        ...(isCritical ? [`Risk: Critical (${input.riskScore})`] : []),
        ...(input.severeConditions >= 2 ? [`${input.severeConditions} severe conditions`] : []),
      ],
    });
  }

  // check-in — moderate risk with no urgent driver.
  const hasUrgent = recs.some((r) => r.priority === 'High');
  if (!hasUrgent && input.riskLevel === 'Medium') {
    recs.push({
      key: 'check-in',
      action: 'Schedule a routine check-in',
      reason: 'Moderate risk with no urgent driver.',
      priority: 'Low',
      factors: [`Risk: Medium (${input.riskScore})`],
    });
  }

  // continue — fallback when nothing urgent applies.
  if (recs.length === 0) {
    recs.push({
      key: 'continue',
      action: 'Continue current care plan',
      reason: 'No urgent signals — stay the course.',
      priority: 'Low',
      factors: [`Risk: ${input.riskLevel} (${input.riskScore})`],
    });
  }

  recs.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  const priority: CarePriority = recs.reduce<CarePriority>(
    (top, r) => (PRIORITY_RANK[r.priority] < PRIORITY_RANK[top] ? r.priority : top),
    'Low',
  );

  return { recommendations: recs, priority };
}
