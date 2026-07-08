/**
 * Shared primitives for the DiNC AI layer.
 *
 * Pure helpers only — no React, no DiNC imports. The `confidence` produced here
 * reflects DATA COMPLETENESS (how many expected inputs were present), NOT model
 * certainty. All UI copy must say "AI-assisted decision support".
 */

import type { ConfidenceResult, RecommendedAction, RiskBand } from './types';

export function nowISO(): string {
  return new Date().toISOString();
}

/** Clamp a value into [0, 1]. */
export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** Round a 0–1 fraction to an integer percentage 0–100. */
export function pct(fraction: number): number {
  return Math.round(clamp01(fraction) * 100);
}

/** Simple English pluraliser: `plural(2, 'appointment')` → "appointments". */
export function plural(n: number, word: string, pluralForm?: string): string {
  return n === 1 ? word : pluralForm ?? `${word}s`;
}

/**
 * Data-completeness confidence in [floor, 98].
 *
 * Rises with the fraction of expected inputs actually present. Never claims
 * certainty: even fully-covered data caps at 98 to signal that this is a
 * heuristic, not a validated model.
 */
export function confidenceFromCoverage(
  present: number,
  total: number,
  floor = 55,
): number {
  if (total <= 0) return floor;
  const fraction = clamp01(present / total);
  const value = Math.round(floor + (98 - floor) * fraction);
  return Math.max(floor, Math.min(98, value));
}

/** Wrap a coverage number into a labelled ConfidenceResult. */
export function confidenceResult(
  present: number,
  total: number,
  floor = 55,
): ConfidenceResult {
  const value = confidenceFromCoverage(present, total, floor);
  const level: ConfidenceResult['level'] =
    value >= 85 ? 'High' : value >= 68 ? 'Medium' : 'Low';
  return { value, level, basis: `${present} of ${total} expected signals present` };
}

/** Map a risk band to concrete outreach urgency guidance. */
export function recommendedActionForRisk(level: RiskBand): RecommendedAction {
  switch (level) {
    case 'Critical':
      return { urgency: 'Immediate', label: 'Escalate & contact within 24 hours', withinHours: 24 };
    case 'High':
      return { urgency: 'Priority', label: 'Call within 24 hours', withinHours: 24 };
    case 'Medium':
      return { urgency: 'Soon', label: 'Contact within 7 days', withinHours: 168 };
    case 'Low':
    default:
      return { urgency: 'Routine', label: 'Routine follow-up', withinHours: 720 };
  }
}
