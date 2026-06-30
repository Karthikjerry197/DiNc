import { Injectable, Logger } from '@nestjs/common';
import type { CdsRecommendation, ClinicalContext } from '../cdse.types';
import type { ClinicalRule } from './rule.interface';
import { BpReviewRule } from '../rules/bp-review.rule';
import { Hba1cReviewRule } from '../rules/hba1c-review.rule';
import { MissedFollowupRule } from '../rules/missed-followup.rule';
import { BmiLifestyleRule } from '../rules/bmi-lifestyle.rule';
import { MedicationReviewRule } from '../rules/medication-review.rule';

/**
 * Central rule registry — the only place that knows all rules.
 *
 * Evaluation order matters: rules are evaluated top-to-bottom and may
 * produce multiple independent recommendations. The registry sorts the
 * final output by priority so the frontend can render highest-priority
 * items first without any additional sorting.
 *
 * To add a new rule:
 *   1. Create the rule class in /rules
 *   2. Add it to CdseModule providers
 *   3. Inject it here and add it to this.rules[]
 *
 * That is all that is required. No other file changes needed.
 */
@Injectable()
export class RuleRegistryService {
  private readonly logger = new Logger(RuleRegistryService.name);

  private static readonly PRIORITY_ORDER: Record<string, number> = {
    CRITICAL:    0,
    HIGH:        1,
    RECOMMENDED: 2,
    PREVENTIVE:  3,
    INFORMATION: 4,
  };

  private readonly rules: ClinicalRule[];

  constructor(
    bpReview: BpReviewRule,
    hba1cReview: Hba1cReviewRule,
    missedFollowup: MissedFollowupRule,
    bmiLifestyle: BmiLifestyleRule,
    medicationReview: MedicationReviewRule,
  ) {
    // Registration order also serves as the tiebreaker when priorities are equal.
    this.rules = [
      missedFollowup,   // safety-net first — most likely to be CRITICAL
      bpReview,
      hba1cReview,
      bmiLifestyle,
      medicationReview,
    ];
  }

  evaluateAll(context: ClinicalContext): CdsRecommendation[] {
    const results: CdsRecommendation[] = [];

    for (const rule of this.rules) {
      try {
        const rec = rule.evaluate(context);
        if (rec) results.push(rec);
      } catch (err) {
        // Rule errors are never fatal — log and continue so other rules still fire.
        this.logger.warn(
          `Rule "${rule.id}" threw an unexpected error and was skipped: ${(err as Error).message}`,
        );
      }
    }

    // Sort by priority so the highest-severity recommendations appear first.
    return results.sort(
      (a, b) =>
        (RuleRegistryService.PRIORITY_ORDER[a.priority] ?? 99) -
        (RuleRegistryService.PRIORITY_ORDER[b.priority] ?? 99),
    );
  }
}
