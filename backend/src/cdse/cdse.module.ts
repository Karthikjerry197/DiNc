import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CdseController } from './cdse.controller';
import { CdseService } from './cdse.service';
import { ContextLoaderService } from './engine/context-loader.service';
import { RuleRegistryService } from './engine/rule-registry.service';
import { BpReviewRule } from './rules/bp-review.rule';
import { Hba1cReviewRule } from './rules/hba1c-review.rule';
import { MissedFollowupRule } from './rules/missed-followup.rule';
import { BmiLifestyleRule } from './rules/bmi-lifestyle.rule';
import { MedicationReviewRule } from './rules/medication-review.rule';

/**
 * Clinical Decision Support Engine module.
 *
 * Each rule is a NestJS provider so it can be injected into the registry
 * and can itself receive injected services if future rules need additional
 * data sources (e.g. a VaccinationRepository for vaccination rules).
 *
 * To add a new rule: create the class, add it to providers[], and inject it
 * into RuleRegistryService. No other files need to change.
 */
@Module({
  imports: [AuthModule],
  controllers: [CdseController],
  exports: [CdseService],
  providers: [
    CdseService,
    ContextLoaderService,
    RuleRegistryService,
    // ── Rule library ─────────────────────────────────────────────────────────
    BpReviewRule,
    Hba1cReviewRule,
    MissedFollowupRule,
    BmiLifestyleRule,
    MedicationReviewRule,
    // Future rules go here:
    // VaccinationRule,
    // PregnancyRule,
    // ChildHealthRule,
    // TuberculosisRule,
    // MentalHealthRule,
    // CancerScreeningRule,
  ],
})
export class CdseModule {}
