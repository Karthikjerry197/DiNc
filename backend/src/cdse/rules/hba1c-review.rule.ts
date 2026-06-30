import { Injectable } from '@nestjs/common';
import type { CdsRecommendation, ClinicalContext } from '../cdse.types';
import type { ClinicalRule } from '../engine/rule.interface';

/**
 * Rule: HbA1c Review (Diabetes)
 *
 * IF:  citizen is enrolled in a Diabetes programme
 * AND: last consultation was more than 90 days ago (or never occurred)
 * THEN: recommend an HbA1c review
 *
 * HbA1c monitoring every 3 months is recommended by the American Diabetes
 * Association and Indian NHM guidelines for uncontrolled diabetes; every 6
 * months for stable/controlled cases. This rule uses the conservative 90-day
 * threshold to flag anyone who may need review.
 */
@Injectable()
export class Hba1cReviewRule implements ClinicalRule {
  readonly id = 'hba1c-review-90d';
  readonly name = 'Diabetes: HbA1c Review (90-day)';
  readonly domain = 'DIABETES';

  private static readonly THRESHOLD_DAYS = 90;
  private static readonly PROGRAM_PATTERN = /diabet|blood\s?sugar|glucose|hba1c|endocrin/i;

  evaluate(ctx: ClinicalContext): CdsRecommendation | null {
    const diabetesPrograms = ctx.activePrograms.filter(
      (p) =>
        Hba1cReviewRule.PROGRAM_PATTERN.test(p.programName) ||
        (p.diseaseName && Hba1cReviewRule.PROGRAM_PATTERN.test(p.diseaseName)),
    );

    if (diabetesPrograms.length === 0) return null;

    const days = ctx.daysSinceLastConsultation;
    if (days !== null && days <= Hba1cReviewRule.THRESHOLD_DAYS) return null;

    const reasons: string[] = [
      `Enrolled in ${diabetesPrograms.map((p) => p.programName).join(', ')}`,
    ];

    if (days === null) {
      reasons.push('No HbA1c or diabetes consultation has been recorded for this citizen');
    } else {
      reasons.push(
        `Last consultation was ${days} day${days === 1 ? '' : 's'} ago` +
          ` (HbA1c review recommended every ${Hba1cReviewRule.THRESHOLD_DAYS} days)`,
      );
    }

    return {
      ruleId: this.id,
      title: 'HbA1c Review Overdue',
      explanation:
        'HbA1c monitoring every 90 days is recommended for diabetes management. Unmonitored blood glucose leads to macro- and micro-vascular complications.',
      reasons,
      action:
        'Arrange an HbA1c blood test. Review diet, medication adherence, and blood glucose self-monitoring records. Assess for signs of complications.',
      priority: 'HIGH',
      supportingRule: `${this.name} — HbA1c review every ${Hba1cReviewRule.THRESHOLD_DAYS} days per NHM diabetes protocol`,
    };
  }
}
