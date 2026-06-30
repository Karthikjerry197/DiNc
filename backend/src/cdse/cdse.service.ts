import { Injectable } from '@nestjs/common';
import { ContextLoaderService } from './engine/context-loader.service';
import { RuleRegistryService } from './engine/rule-registry.service';
import { calculateRisk } from './engine/risk-calculator';
import type { CdsResponse } from './cdse.types';

/**
 * Orchestrates the CDSE evaluation pipeline:
 *   1. Load clinical context from existing tables (ContextLoaderService)
 *   2. Evaluate all registered rules against the context (RuleRegistryService)
 *   3. Derive overall risk level from the fired recommendations (calculateRisk)
 *   4. Return a structured CdsResponse
 *
 * This service is intentionally thin — all clinical logic lives in the rules,
 * all data loading lives in the context loader, and all risk math lives in
 * the calculator. Future extensibility (DB-driven rules, caching, audit log)
 * can be added here without touching the rules or the loader.
 */
@Injectable()
export class CdseService {
  constructor(
    private readonly contextLoader: ContextLoaderService,
    private readonly ruleRegistry: RuleRegistryService,
  ) {}

  async evaluate(citizenId: string): Promise<CdsResponse> {
    const context = await this.contextLoader.load(citizenId);
    const recommendations = this.ruleRegistry.evaluateAll(context);
    const { level, explanation } = calculateRisk(recommendations);

    return {
      citizenId,
      overallRisk: level,
      riskExplanation: explanation,
      recommendations,
      evaluatedAt: new Date().toISOString(),
      totalActivePrograms: context.activePrograms.length,
      totalConsultations: context.totalConsultations,
    };
  }
}
