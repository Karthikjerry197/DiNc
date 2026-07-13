import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { OverallRiskRepository } from './overall-risk.repository';
import {
  ClinicalSeverity,
  FollowupRisk,
  OverallRisk,
  OverallRiskBatchResultDto,
  OverallRiskMatrixEntryDto,
  OverallRiskMatrixRow,
  OverallRiskResolutionDto,
} from './overall-risk.types';

/** Ordinal ranks — used ONLY to describe which input drives the rating in the
 * explanation text. They never decide the Overall Risk (the matrix does). */
const SEVERITY_RANK: Record<ClinicalSeverity, number> = { LOW: 1, MODERATE: 2, SEVERE: 3 };
const FOLLOWUP_RANK: Record<FollowupRisk, number> = { LOW: 1, MODERATE: 2, HIGH: 3 };

/**
 * Overall Risk Service — the ONE place Overall Risk is computed.
 *
 * Input:  Clinical Severity (CDSE outcome category) × AI Follow-up Risk (band).
 * Output: Overall Risk.
 *
 * The decision is a lookup in the `overall_risk_matrix` PostgreSQL table — never
 * an if/else. Both the single `resolve` and the batch `resolveMany` share the
 * same normalisation and lookup, over a briefly-cached copy of the matrix, so
 * there is exactly one combination path in the platform.
 */
@Injectable()
export class OverallRiskService {
  private matrixCache: { map: Map<string, OverallRisk>; expiresAt: number } | null = null;
  private static readonly TTL_MS = 60_000;

  constructor(private readonly repo: OverallRiskRepository) {}

  private static key(s: ClinicalSeverity, f: FollowupRisk): string {
    return `${s}|${f}`;
  }

  /** The matrix as an in-memory map, cached briefly (it is seed-configured and
   * changes rarely). Loaded once and reused across every item of a batch. */
  private async getMatrixMap(): Promise<Map<string, OverallRisk>> {
    if (this.matrixCache && this.matrixCache.expiresAt > Date.now()) {
      return this.matrixCache.map;
    }
    const rows = await this.repo.listMatrix();
    const map = new Map<string, OverallRisk>();
    for (const r of rows) {
      if (r.is_active) map.set(OverallRiskService.key(r.clinical_severity, r.followup_risk), r.overall_risk);
    }
    this.matrixCache = { map, expiresAt: Date.now() + OverallRiskService.TTL_MS };
    return map;
  }

  // ── Input classification (NOT decision logic) ───────────────────────────────

  private static normaliseSeverity(raw: string): ClinicalSeverity {
    switch ((raw ?? '').trim().toUpperCase()) {
      case 'NONE':
      case 'LOW':
        return 'LOW';
      case 'MODERATE':
        return 'MODERATE';
      case 'SEVERE':
        return 'SEVERE';
      default:
        throw new BadRequestException(
          `Unknown clinical severity '${raw}'. Expected NONE, LOW, MODERATE or SEVERE.`,
        );
    }
  }

  private static normaliseFollowup(raw: string): FollowupRisk {
    switch ((raw ?? '').trim().toUpperCase()) {
      case 'LOW':
        return 'LOW';
      case 'MEDIUM':
      case 'MODERATE':
        return 'MODERATE';
      case 'HIGH':
        return 'HIGH';
      default:
        throw new BadRequestException(
          `Unknown follow-up risk '${raw}'. Expected LOW, MEDIUM/MODERATE or HIGH.`,
        );
    }
  }

  // ── Resolution (single shared code path) ────────────────────────────────────

  /** Normalises the two inputs and looks up the matrix map. The single source of
   * the Overall Risk decision — both resolve() and resolveMany() call this. */
  private resolveWith(
    map: Map<string, OverallRisk>,
    clinicalSeverityRaw: string,
    followupRiskRaw: string,
  ): OverallRiskResolutionDto {
    const clinicalSeverity = OverallRiskService.normaliseSeverity(clinicalSeverityRaw);
    const followupRisk = OverallRiskService.normaliseFollowup(followupRiskRaw);
    const overallRisk = map.get(OverallRiskService.key(clinicalSeverity, followupRisk));
    if (!overallRisk) {
      throw new ServiceUnavailableException(
        `No overall-risk matrix entry for ${clinicalSeverity} × ${followupRisk}.`,
      );
    }
    return {
      clinicalSeverity,
      followupRisk,
      overallRisk,
      explanation: OverallRiskService.explain(clinicalSeverity, followupRisk, overallRisk),
      matched: true,
      source: 'matrix',
    };
  }

  async resolve(clinicalSeverityRaw: string, followupRiskRaw: string): Promise<OverallRiskResolutionDto> {
    return this.resolveWith(await this.getMatrixMap(), clinicalSeverityRaw, followupRiskRaw);
  }

  /**
   * Batch resolution for patient lists (Dashboard, Worklist). Loads the matrix
   * ONCE, then resolves every item in memory — one DB round-trip regardless of
   * list size. Each result carries the caller's `id` and is otherwise identical
   * to the single-resolve response. Items with unparseable inputs are omitted;
   * the caller treats a missing id as "Pending Assessment".
   */
  async resolveMany(
    items: Array<{ id: string; clinicalSeverity: string; followupRisk: string }>,
  ): Promise<OverallRiskBatchResultDto[]> {
    const map = await this.getMatrixMap();
    const results: OverallRiskBatchResultDto[] = [];
    for (const item of items) {
      try {
        results.push({ id: item.id, ...this.resolveWith(map, item.clinicalSeverity, item.followupRisk) });
      } catch {
        // Skip — the caller renders a "Pending Assessment" state for missing ids.
      }
    }
    return results;
  }

  async getMatrix(): Promise<OverallRiskMatrixEntryDto[]> {
    const rows = await this.repo.listMatrix();
    return rows.map(OverallRiskService.toEntry);
  }

  // ── Presentation helpers ────────────────────────────────────────────────────

  /**
   * A clinician-readable explanation of WHY the Overall Risk was assigned. It
   * states the rating, both contributing factors in plain language, and which
   * factor is the main driver. Derived entirely from the three values — it
   * describes the matrix result, it does not re-decide it.
   */
  private static explain(
    severity: ClinicalSeverity,
    followup: FollowupRisk,
    overall: OverallRisk,
  ): string {
    const sevWord = severity.toLowerCase();
    const fuWord = followup.toLowerCase();
    const overallWord = overall.toLowerCase();

    let driver: string;
    if (SEVERITY_RANK[severity] > FOLLOWUP_RANK[followup]) {
      driver = 'The clinical severity is the main driver of this rating.';
    } else if (FOLLOWUP_RANK[followup] > SEVERITY_RANK[severity]) {
      driver = 'The likelihood of missing follow-up is the main driver of this rating.';
    } else {
      driver = 'Clinical severity and follow-up risk contribute equally to this rating.';
    }

    return (
      `Overall risk is ${overallWord}. This patient's clinical severity is ${sevWord} ` +
      `and their predicted follow-up default probability is ${fuWord}. ${driver}`
    );
  }

  private static toEntry(row: OverallRiskMatrixRow): OverallRiskMatrixEntryDto {
    return {
      id: row.id,
      clinicalSeverity: row.clinical_severity,
      followupRisk: row.followup_risk,
      overallRisk: row.overall_risk,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
