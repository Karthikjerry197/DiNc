import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ClinicalSeverity,
  FollowupRisk,
  OVERALL_RISK_SEED,
  OverallRiskMatrixRow,
} from './overall-risk.types';

/**
 * Data-access layer for the Overall Risk Decision Matrix. Owns one additive table
 * (`overall_risk_matrix`), created idempotently on boot and seeded once with the
 * nine authored combinations. This is the ONLY file containing SQL for the
 * feature. The seed uses ON CONFLICT DO NOTHING so administrator edits to the
 * matrix are never overwritten on a later boot.
 */
@Injectable()
export class OverallRiskRepository implements OnModuleInit {
  private readonly logger = new Logger(OverallRiskRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.migrate();
      await this.seed();
    } catch (error) {
      this.logger.error(`Overall risk matrix provisioning failed: ${(error as Error).message}`);
    }
  }

  // ── DDL (additive, idempotent) ──────────────────────────────────────────────

  private async migrate(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS dinc_app.overall_risk_matrix (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        clinical_severity VARCHAR(10) NOT NULL CHECK (clinical_severity IN ('LOW','MODERATE','SEVERE')),
        followup_risk     VARCHAR(10) NOT NULL CHECK (followup_risk IN ('LOW','MODERATE','HIGH')),
        overall_risk      VARCHAR(10) NOT NULL CHECK (overall_risk IN ('LOW','MODERATE','HIGH')),
        is_active         BOOLEAN     NOT NULL DEFAULT true,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (clinical_severity, followup_risk)
      )
    `);
  }

  // ── Seed (definitional presence; never clobbers admin edits) ────────────────

  private async seed(): Promise<void> {
    for (const row of OVERALL_RISK_SEED) {
      await this.db.query(
        `INSERT INTO dinc_app.overall_risk_matrix (clinical_severity, followup_risk, overall_risk)
         VALUES ($1, $2, $3)
         ON CONFLICT (clinical_severity, followup_risk) DO NOTHING`,
        [row.clinicalSeverity, row.followupRisk, row.overallRisk],
      );
    }
  }

  // ── Reads ───────────────────────────────────────────────────────────────────

  /** The full matrix, ordered for stable display/inspection. */
  async listMatrix(): Promise<OverallRiskMatrixRow[]> {
    const result = await this.db.query<OverallRiskMatrixRow>(
      `SELECT id, clinical_severity, followup_risk, overall_risk, is_active, created_at, updated_at
       FROM dinc_app.overall_risk_matrix
       ORDER BY
         CASE clinical_severity WHEN 'LOW' THEN 0 WHEN 'MODERATE' THEN 1 WHEN 'SEVERE' THEN 2 END,
         CASE followup_risk     WHEN 'LOW' THEN 0 WHEN 'MODERATE' THEN 1 WHEN 'HIGH'   THEN 2 END`,
    );
    return result.rows;
  }

  /** The single active matrix row for a (severity × follow-up) pair, or null. */
  async findEntry(
    clinicalSeverity: ClinicalSeverity,
    followupRisk: FollowupRisk,
  ): Promise<OverallRiskMatrixRow | null> {
    const result = await this.db.query<OverallRiskMatrixRow>(
      `SELECT id, clinical_severity, followup_risk, overall_risk, is_active, created_at, updated_at
       FROM dinc_app.overall_risk_matrix
       WHERE clinical_severity = $1 AND followup_risk = $2 AND is_active = true
       LIMIT 1`,
      [clinicalSeverity, followupRisk],
    );
    return result.rows[0] ?? null;
  }
}
