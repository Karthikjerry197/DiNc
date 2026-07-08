/**
 * Follow-up default engine — probability (0–100) that a citizen misses their
 * next follow-up.
 *
 * Eight hand-weighted, explainable factors whose weights sum to 100. Each
 * factor's points are rounded to an integer and the probability is the SUM of
 * those integer points, so the invariant "points sum exactly to probability"
 * holds by construction. Weights are the manually chosen values from the spec —
 * this is NOT a trained model.
 */

import type {
  FollowupBand,
  FollowupInput,
  FollowupPriority,
  FollowupResult,
  PredictionFactor,
} from './types';
import { MODEL_VERSIONS } from './types';
import { clamp01, confidenceResult, nowISO, plural } from './ai-common';

/** Factor weights (sum = 100). */
const W = {
  attendance: 26,
  priorMissed: 20,
  reschedules: 14,
  followUpGap: 12,
  overdue: 12,
  contactGap: 8,
  multiCondition: 5,
  age: 3,
} as const;

/** Linear ramp: `x` mapped from [lo, hi] onto [0, 1], clamped. */
function ramp(x: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  return clamp01((x - lo) / (hi - lo));
}

export function bandForProbability(probability: number): FollowupBand {
  if (probability >= 60) return 'High';
  if (probability >= 34) return 'Medium';
  return 'Low';
}

function priorityForBand(band: FollowupBand): FollowupPriority {
  switch (band) {
    case 'High':
      return { label: 'Call Today', rank: 1 };
    case 'Medium':
      return { label: 'Call This Week', rank: 2 };
    case 'Low':
    default:
      return { label: 'Routine Outreach', rank: 3 };
  }
}

export function predictFollowupDefault(input: FollowupInput): FollowupResult {
  const factors: PredictionFactor[] = [];

  const push = (key: string, label: string, max: number, raw: number, reason: string) => {
    const points = Math.round(Math.max(0, Math.min(max, raw)));
    factors.push({ key, label, points, max, active: points > 0, reason: points > 0 ? reason : '' });
  };

  // attendance (26) — lower historical attendance ⇒ more points.
  if (input.attendanceRate != null) {
    const share = 1 - clamp01(input.attendanceRate);
    push(
      'attendance',
      'Low attendance history',
      W.attendance,
      W.attendance * share,
      `Historical attendance ${Math.round(clamp01(input.attendanceRate) * 100)}%`,
    );
  } else {
    factors.push({ key: 'attendance', label: 'Low attendance history', points: 0, max: W.attendance, active: false, reason: '' });
  }

  // priorMissed (20) — saturating at 4 misses. Monotonic in priorMissed.
  push(
    'priorMissed',
    'Missed appointments',
    W.priorMissed,
    W.priorMissed * ramp(input.priorMissed, 0, 4),
    `${input.priorMissed} missed ${plural(input.priorMissed, 'appointment')} on record`,
  );

  // reschedules (14) — saturating at 3.
  push(
    'reschedules',
    'Prior reschedules',
    W.reschedules,
    W.reschedules * ramp(input.priorReschedules, 0, 3),
    `${input.priorReschedules} prior ${plural(input.priorReschedules, 'reschedule')}`,
  );

  // followUpGap (12) — long interval to the next follow-up (14→60 days).
  if (input.followUpGapDays != null) {
    push(
      'followUpGap',
      'Long follow-up interval',
      W.followUpGap,
      W.followUpGap * ramp(input.followUpGapDays, 14, 60),
      `Next follow-up ${input.followUpGapDays} days out`,
    );
  } else {
    factors.push({ key: 'followUpGap', label: 'Long follow-up interval', points: 0, max: W.followUpGap, active: false, reason: '' });
  }

  // overdue (12) — currently overdue.
  push(
    'overdue',
    'Currently overdue',
    W.overdue,
    input.overdueNow ? W.overdue : 0,
    'Currently overdue for follow-up',
  );

  // contactGap (8) — long time since last contact (30→90 days).
  if (input.daysSinceContact != null) {
    push(
      'contactGap',
      'Stale contact',
      W.contactGap,
      W.contactGap * ramp(input.daysSinceContact, 30, 90),
      `${input.daysSinceContact} days since last contact`,
    );
  } else {
    factors.push({ key: 'contactGap', label: 'Stale contact', points: 0, max: W.contactGap, active: false, reason: '' });
  }

  // multiCondition (5) — multiple chronic conditions (1→3).
  push(
    'multiCondition',
    'Multiple chronic conditions',
    W.multiCondition,
    W.multiCondition * ramp(input.chronicConditions, 1, 3),
    `${input.chronicConditions} chronic ${plural(input.chronicConditions, 'condition')}`,
  );

  // age (3) — older age band (50→70).
  if (input.age != null) {
    push('age', 'Older age band', W.age, W.age * ramp(input.age, 50, 70), `Age ${input.age}`);
  } else {
    factors.push({ key: 'age', label: 'Older age band', points: 0, max: W.age, active: false, reason: '' });
  }

  const probability = factors.reduce((sum, f) => sum + f.points, 0);
  const band = bandForProbability(probability);

  factors.sort((a, b) => b.points - a.points);

  // Confidence = coverage over the 9 raw inputs (5 always-present numeric flags
  // plus the 4 nullable signals that may be unknown).
  const present =
    5 +
    (input.attendanceRate != null ? 1 : 0) +
    (input.followUpGapDays != null ? 1 : 0) +
    (input.age != null ? 1 : 0) +
    (input.daysSinceContact != null ? 1 : 0);

  return {
    probability,
    band,
    factors,
    priority: priorityForBand(band),
    confidence: confidenceResult(present, 9),
    meta: { engine: 'rule-based', modelVersion: MODEL_VERSIONS.followup, generatedAt: nowISO() },
  };
}
