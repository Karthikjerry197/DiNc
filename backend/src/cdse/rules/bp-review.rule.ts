import { Injectable } from '@nestjs/common';
import type { CdsRecommendation, ClinicalContext } from '../cdse.types';
import type { ClinicalRule } from '../engine/rule.interface';

/**
 * Rule: Blood Pressure Review (Hypertension)
 *
 * IF:  citizen is enrolled in a Hypertension programme
 * AND: last consultation was more than 30 days ago (or never occurred)
 * THEN: recommend a BP review
 *
 * Future configuration hooks (for DB-driven rules):
 *   • THRESHOLD_DAYS — adjustable without code change
 *   • PROGRAM_PATTERN — allow custom programme name matching
 */
@Injectable()
export class BpReviewRule implements ClinicalRule {
  readonly id = 'bp-review-30d';
  readonly name = 'Hypertension: Blood Pressure Review (30-day)';
  readonly domain = 'HYPERTENSION';

  private static readonly THRESHOLD_DAYS = 30;
  private static readonly PROGRAM_PATTERN = /hypertension|htn|blood\s?pressure|cardio/i;

  evaluate(ctx: ClinicalContext): CdsRecommendation | null {
    const htnPrograms = ctx.activePrograms.filter(
      (p) =>
        BpReviewRule.PROGRAM_PATTERN.test(p.programName) ||
        (p.diseaseName && BpReviewRule.PROGRAM_PATTERN.test(p.diseaseName)),
    );

    if (htnPrograms.length === 0) return null;

    const days = ctx.daysSinceLastConsultation;
    if (days !== null && days <= BpReviewRule.THRESHOLD_DAYS) return null;

    const reasons: string[] = [
      `Enrolled in ${htnPrograms.map((p) => p.programName).join(', ')}`,
    ];

    if (days === null) {
      reasons.push('No blood pressure consultation has been recorded for this citizen');
    } else {
      reasons.push(
        `Last consultation was ${days} day${days === 1 ? '' : 's'} ago` +
          ` (review is due every ${BpReviewRule.THRESHOLD_DAYS} days)`,
      );
    }

    return {
      ruleId: this.id,
      title: 'Blood Pressure Review Required',
      explanation:
        'Regular blood pressure monitoring is essential for hypertension management and reduces the risk of cardiovascular events, stroke, and kidney damage.',
      reasons,
      action:
        'Measure blood pressure at the next contact. Review medication adherence and current antihypertensive regimen. Update the hypertension care plan.',
      priority: 'HIGH',
      supportingRule: `${this.name} — BP review every ${BpReviewRule.THRESHOLD_DAYS} days per NHM protocol`,
    };
  }
}
