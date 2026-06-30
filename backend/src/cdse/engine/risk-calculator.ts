import type { CdsRecommendation, RiskLevel } from '../cdse.types';

/**
 * Derives an overall risk level from the set of fired recommendations.
 *
 * Risk escalation ladder (highest priority wins):
 *   CRITICAL recommendation present → HIGH risk
 *   HIGH recommendation present     → HIGH risk
 *   RECOMMENDED recommendation      → MODERATE risk
 *   PREVENTIVE only                 → LOW risk
 *   No recommendations              → LOW risk
 *
 * Future: thresholds could be loaded from the cdse_rules table to let
 * administrators tune risk escalation without a code deployment.
 */
export function calculateRisk(recommendations: CdsRecommendation[]): {
  level: RiskLevel;
  explanation: string;
} {
  if (recommendations.some((r) => r.priority === 'CRITICAL')) {
    return {
      level: 'HIGH',
      explanation: 'Critical clinical concerns require immediate attention.',
    };
  }
  if (recommendations.some((r) => r.priority === 'HIGH')) {
    return {
      level: 'HIGH',
      explanation: 'High-priority clinical actions are overdue for this citizen.',
    };
  }
  if (recommendations.some((r) => r.priority === 'RECOMMENDED')) {
    return {
      level: 'MODERATE',
      explanation: 'One or more recommended clinical reviews are due.',
    };
  }
  if (recommendations.some((r) => r.priority === 'PREVENTIVE')) {
    return {
      level: 'LOW',
      explanation: 'Preventive care measures are suggested.',
    };
  }
  return {
    level: 'LOW',
    explanation: 'No active clinical concerns identified at this time.',
  };
}
