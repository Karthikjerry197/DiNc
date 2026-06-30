import type { CdsRecommendation, ClinicalContext } from '../cdse.types';

/**
 * Every clinical rule implements this interface.
 *
 * To add a new rule:
 *   1. Create a new file in /rules that implements ClinicalRule
 *   2. Decorate it with @Injectable()
 *   3. Add it to the `providers` array in CdseModule
 *   4. Inject it into RuleRegistryService and append it to this.rules
 *
 * No other files need to change. The engine is open for extension but
 * closed for modification.
 *
 * Future: when rules are stored in PostgreSQL, the `id` field acts as the
 * stable foreign key linking a runtime rule class to its DB configuration
 * (thresholds, enabled flag, override text, etc.).
 */
export interface ClinicalRule {
  /**
   * Stable, unique identifier for this rule.
   * Survives renames — must never change once deployed.
   */
  readonly id: string;

  /** Human-readable name for logging and future admin configuration UI. */
  readonly name: string;

  /**
   * Clinical domain (e.g. 'HYPERTENSION', 'DIABETES', 'SAFETY', 'LIFESTYLE').
   * Used for grouping in future admin UI and analytics.
   */
  readonly domain: string;

  /**
   * Evaluates the clinical context for one citizen.
   *
   * Returns a CdsRecommendation when the rule fires (conditions met).
   * Returns null when the rule does not apply (citizen not in scope for
   * this rule, or conditions not met).
   *
   * Rules must NEVER throw — the registry catches errors defensively,
   * but rules should always return null rather than throwing when
   * data is missing.
   */
  evaluate(context: ClinicalContext): CdsRecommendation | null;
}
