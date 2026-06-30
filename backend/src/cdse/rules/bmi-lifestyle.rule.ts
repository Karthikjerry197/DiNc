import { Injectable } from '@nestjs/common';
import type { CdsRecommendation, ClinicalContext } from '../cdse.types';
import type { ClinicalRule } from '../engine/rule.interface';

/**
 * Rule: BMI / Lifestyle Counselling
 *
 * Fires when either:
 *   (a) A recent outcome record contains a BMI field with value > 25
 *   (b) The citizen is enrolled in an obesity or lifestyle programme
 *
 * The fields in outcome_records.data.fields are template-driven and keyed
 * by field label (e.g. "BMI", "Body Mass Index", "bmi"). The rule uses a
 * case-insensitive key scan so it adapts to any template naming convention.
 *
 * BMI thresholds (WHO / Asian guidelines for Indian populations):
 *   ≥ 23: overweight (Asian cut-off)
 *   ≥ 25: overweight (international cut-off)
 *   ≥ 30: obese
 *
 * This implementation uses 25 to align with standard international
 * programmes. The threshold can be moved to DB config in a future iteration.
 */
@Injectable()
export class BmiLifestyleRule implements ClinicalRule {
  readonly id = 'bmi-lifestyle-25';
  readonly name = 'Lifestyle: BMI Overweight/Obesity Counselling';
  readonly domain = 'LIFESTYLE';

  private static readonly BMI_THRESHOLD = 25;
  private static readonly BMI_KEY_PATTERN = /^bmi$|body.?mass.?index/i;
  private static readonly LIFESTYLE_PROGRAM_PATTERN = /obes|lifestyle|weight|nutrition|ncd/i;

  evaluate(ctx: ClinicalContext): CdsRecommendation | null {
    // Path A: check recent clinical field data for a recorded BMI
    let recordedBmi: number | null = null;
    let bmiRecordedAt: string | null = null;

    for (const outcome of ctx.recentOutcomeData) {
      for (const [key, val] of Object.entries(outcome.fields)) {
        if (BmiLifestyleRule.BMI_KEY_PATTERN.test(key)) {
          const num = Number(val);
          if (!Number.isNaN(num) && num > 0) {
            recordedBmi = num;
            bmiRecordedAt = outcome.recordedAt;
            break;
          }
        }
      }
      if (recordedBmi !== null) break;
    }

    // Path B: enrolled in an obesity/lifestyle programme
    const lifestylePrograms = ctx.activePrograms.filter(
      (p) =>
        BmiLifestyleRule.LIFESTYLE_PROGRAM_PATTERN.test(p.programName) ||
        (p.diseaseName && BmiLifestyleRule.LIFESTYLE_PROGRAM_PATTERN.test(p.diseaseName)),
    );

    const bmiTriggered = recordedBmi !== null && recordedBmi >= BmiLifestyleRule.BMI_THRESHOLD;
    const programTriggered = lifestylePrograms.length > 0;

    if (!bmiTriggered && !programTriggered) return null;

    const reasons: string[] = [];

    if (bmiTriggered && recordedBmi !== null) {
      const category = recordedBmi >= 30 ? 'obese' : 'overweight';
      reasons.push(
        `Recorded BMI of ${recordedBmi.toFixed(1)} indicates ${category}` +
          (bmiRecordedAt
            ? ` (recorded ${new Date(bmiRecordedAt).toLocaleDateString('en-IN')})`
            : ''),
      );
    }

    if (programTriggered) {
      reasons.push(
        `Enrolled in ${lifestylePrograms.map((p) => p.programName).join(', ')}`,
      );
    }

    if (reasons.length === 0) return null;

    return {
      ruleId: this.id,
      title: 'Lifestyle Counselling Recommended',
      explanation:
        'A BMI above the healthy range increases risk of type 2 diabetes, hypertension, cardiovascular disease, joint problems, and certain cancers.',
      reasons,
      action:
        'Provide structured lifestyle counselling covering diet, physical activity, and weight management targets. Consider referral to a dietitian or NCD lifestyle programme if BMI ≥ 30.',
      priority: 'RECOMMENDED',
      supportingRule: `${this.name} — BMI ≥ ${BmiLifestyleRule.BMI_THRESHOLD} triggers lifestyle counselling per NHM NCD guidelines`,
    };
  }
}
