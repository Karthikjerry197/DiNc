import { Injectable, Logger } from '@nestjs/common';
import { CdseRepository } from './cdse.repository';
import type {
  AlertWithCitizen,
  CdsResponse,
  ClinicalAlert,
  CitizenRiskSummary,
  RiskClassificationResult,
  RiskLevel,
} from './cdse.types';

/**
 * CDSE Service — Milestone 25 redesign.
 *
 * Single responsibility: classify the patient's clinical risk from the
 * counselling items checked during the completed consultation.
 *
 * Classification is purely deterministic — no ML, no scoring, no weighting.
 * Disease knowledge lives entirely in the counselling_items.category metadata;
 * this engine contains zero disease-specific logic.
 */
@Injectable()
export class CdseService {
  private readonly logger = new Logger(CdseService.name);

  constructor(private readonly repo: CdseRepository) {}

  // ── Post-consultation hook ────────────────────────────────────────────────────

  /**
   * Called by ConsultationService after every save.
   * Evaluates checked items, creates/resolves alerts, returns the result.
   * Never throws — errors are logged and null is returned so consultation
   * saves always succeed regardless of CDSE state.
   */
  async classifyAfterConsultation(
    activityId: string,
    checkedItemIds: string[],
    counsellingItemIds: string[],
  ): Promise<RiskClassificationResult | null> {
    try {
      const info = await this.repo.getActivityInfo(activityId);
      if (!info) return null;

      const { citizenId, disease } = info;
      const allIds = [...new Set([...checkedItemIds, ...counsellingItemIds])];
      const categoryMap = await this.repo.getItemCategories(allIds);

      const riskLevel = this.classify(checkedItemIds, counsellingItemIds, categoryMap);

      // Resolve any existing ACTIVE alert for this citizen+disease before
      // creating a new one (avoids duplicate open alerts per disease).
      await this.repo.resolveAlerts(citizenId, disease, 'system-reclassified');

      let alert: ClinicalAlert | null = null;
      if (riskLevel === 'MODERATE' || riskLevel === 'SEVERE') {
        alert = await this.repo.createAlert(citizenId, activityId, disease, riskLevel);
      }

      this.logger.log(
        `[CDSE] Activity ${activityId} → ${riskLevel} (${checkedItemIds.length} items checked)`,
      );

      return {
        citizenId,
        activityId,
        riskLevel,
        disease,
        alert,
        evaluatedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error('[CDSE] classifyAfterConsultation failed', (err as Error).message);
      return null;
    }
  }

  // ── Classification engine ────────────────────────────────────────────────────

  /**
   * Pure deterministic classification.
   *
   * SEVERE  — any checked item is DANGER_SIGN or REFERRAL_CRITERIA.
   * MODERATE — any unchecked item (among counsellingItemIds) is
   *            MEDICATION_ADHERENCE or LIFESTYLE (negative response).
   * LOW     — consultation recorded, no issues found.
   * NONE    — no counselling items provided at all.
   */
  classify(
    checkedItemIds: string[],
    allItemIds: string[],
    categoryMap: Map<string, string>,
  ): RiskLevel {
    if (allItemIds.length === 0 && checkedItemIds.length === 0) return 'NONE';

    const checkedSet = new Set(checkedItemIds);

    for (const id of checkedItemIds) {
      const cat = categoryMap.get(id);
      if (cat === 'DANGER_SIGN' || cat === 'REFERRAL_CRITERIA') return 'SEVERE';
    }

    for (const id of allItemIds) {
      if (checkedSet.has(id)) continue;
      const cat = categoryMap.get(id);
      if (cat === 'MEDICATION_ADHERENCE' || cat === 'LIFESTYLE') return 'MODERATE';
    }

    return checkedItemIds.length > 0 || allItemIds.length > 0 ? 'LOW' : 'NONE';
  }

  // ── Query API ─────────────────────────────────────────────────────────────────

  async getLatestRisk(citizenId: string): Promise<CitizenRiskSummary> {
    const alerts = await this.repo.getActiveAlerts(citizenId);

    const severest =
      alerts.find((a) => a.riskLevel === 'SEVERE') ??
      alerts.find((a) => a.riskLevel === 'MODERATE') ??
      null;

    if (severest) {
      return {
        citizenId,
        riskLevel: severest.riskLevel,
        disease: severest.disease,
        evaluatedAt: severest.triggeredAt,
        activeAlert: severest,
      };
    }

    const hasConsult = await this.repo.hasAnyConsultation(citizenId);
    return {
      citizenId,
      riskLevel: hasConsult ? 'LOW' : 'NONE',
      disease: null,
      evaluatedAt: null,
      activeAlert: null,
    };
  }

  async getActiveAlerts(citizenId: string): Promise<ClinicalAlert[]> {
    return this.repo.getActiveAlerts(citizenId);
  }

  async getAllAlerts(citizenId: string): Promise<ClinicalAlert[]> {
    return this.repo.getAllAlerts(citizenId);
  }

  async getActiveAlertsForBell(
    limit = 20,
    status: 'ACTIVE' | 'RESOLVED' = 'ACTIVE',
  ): Promise<AlertWithCitizen[]> {
    return this.repo.getActiveAlertsForBell(limit, status);
  }

  // ── Backward-compat shim for Care Plan module ─────────────────────────────────

  /**
   * Returns the old CdsResponse shape with empty recommendations.
   * Kept so the Care Plan module continues to compile without changes.
   */
  async evaluate(citizenId: string): Promise<CdsResponse> {
    const risk = await this.getLatestRisk(citizenId);

    const oldRisk: 'LOW' | 'MODERATE' | 'HIGH' =
      risk.riskLevel === 'SEVERE'
        ? 'HIGH'
        : risk.riskLevel === 'MODERATE'
          ? 'MODERATE'
          : 'LOW';

    return {
      citizenId,
      overallRisk: oldRisk,
      riskExplanation: `Clinical risk: ${risk.riskLevel}`,
      recommendations: [],
      evaluatedAt: new Date().toISOString(),
      totalActivePrograms: 0,
      totalConsultations: 0,
    };
  }
}
