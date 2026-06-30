import { Injectable } from '@nestjs/common';
import type { CdsRecommendation, ClinicalContext } from '../cdse.types';
import type { ClinicalRule } from '../engine/rule.interface';

/**
 * Rule: Medication Review Overdue
 *
 * IF:  citizen has at least one active enrolment (i.e. is on a care plan
 *      which typically involves medications)
 * AND: last consultation was more than 180 days ago (or never occurred)
 * THEN: recommend a medication review
 *
 * This is a proxy rule: DiNC does not yet have a dedicated medications table,
 * so the rule infers medication review need from programme enrolment + time
 * since last consultation. A citizen on an active programme for 6+ months
 * without any consultation should have their treatment plan reviewed.
 *
 * Future: when a medications table exists, replace the consultation-date proxy
 * with a direct query on last medication dispensing / prescription date.
 */
@Injectable()
export class MedicationReviewRule implements ClinicalRule {
  readonly id = 'medication-review-180d';
  readonly name = 'Medication Review Overdue (180-day)';
  readonly domain = 'MEDICATION';

  private static readonly THRESHOLD_DAYS = 180;

  evaluate(ctx: ClinicalContext): CdsRecommendation | null {
    if (ctx.activePrograms.length === 0) return null;

    const days = ctx.daysSinceLastConsultation;

    // If a consultation happened within the threshold, no action needed.
    if (days !== null && days <= MedicationReviewRule.THRESHOLD_DAYS) return null;

    const reasons: string[] = [
      `Enrolled in ${ctx.activePrograms.map((p) => p.programName).join(', ')}`,
    ];

    if (days === null) {
      reasons.push('No consultation has ever been recorded — medication status is unknown');
    } else {
      reasons.push(
        `Last consultation was ${days} day${days === 1 ? '' : 's'} ago` +
          ` (medication review recommended every ${MedicationReviewRule.THRESHOLD_DAYS} days)`,
      );
    }

    return {
      ruleId: this.id,
      title: 'Medication Review Overdue',
      explanation:
        'Long-term medications require periodic review to assess effectiveness, side effects, adherence, and continued appropriateness. Unreviewed prescriptions are a patient safety risk.',
      reasons,
      action:
        'Conduct a structured medication review at the next consultation. Check adherence, record current medications, assess for side effects, and update the care plan.',
      priority: 'RECOMMENDED',
      supportingRule: `${this.name} — medication review every ${MedicationReviewRule.THRESHOLD_DAYS} days for all active programme enrolments`,
    };
  }
}
