import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { ClinicalAlert, AlertWithCitizen } from './cdse.types';

/**
 * CDSE repository: schema migrations and all DB operations for risk
 * classification and clinical alerts.
 *
 * Migrations run on module init — idempotent via IF NOT EXISTS / IF EXISTS guards.
 */
@Injectable()
export class CdseRepository implements OnModuleInit {
  private readonly logger = new Logger(CdseRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.migrate();
    } catch (err) {
      this.logger.error('CDSE migration failed', (err as Error).message);
    }
  }

  // ── Schema migrations ───────────────────────────────────────────────────────

  private async migrate(): Promise<void> {
    // 1. Add category column to counselling_items
    await this.db.query(`
      ALTER TABLE public.counselling_items
        ADD COLUMN IF NOT EXISTS category VARCHAR(25)
          CHECK (category IN ('DANGER_SIGN','REFERRAL_CRITERIA','MEDICATION_ADHERENCE','LIFESTYLE'))
    `);

    // 2. Create clinical_alerts table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS public.clinical_alerts (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        citizen_id    UUID        NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
        activity_id   UUID        REFERENCES public.worklist_items(id) ON DELETE SET NULL,
        disease       TEXT,
        risk_level    VARCHAR(10) NOT NULL CHECK (risk_level IN ('MODERATE','SEVERE')),
        status        VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','RESOLVED')),
        triggered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at   TIMESTAMPTZ,
        resolved_by   TEXT
      )
    `);

    // 3. Index — most lookups are by citizen_id + status
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_clinical_alerts_citizen_status
        ON public.clinical_alerts(citizen_id, status)
    `);

    // 4. Auto-categorize counselling items from section names (idempotent)
    await this.db.query(`
      UPDATE public.counselling_items ci
      SET category = CASE
        WHEN cs.name ILIKE '%danger%sign%' OR cs.name ILIKE '%warning%sign%'
          THEN 'DANGER_SIGN'
        WHEN cs.name ILIKE '%referral%'
          THEN 'REFERRAL_CRITERIA'
        WHEN cs.name ILIKE '%medication%adherence%'
          OR cs.name ILIKE '%treatment%adherence%'
          OR cs.name ILIKE '%medication%safety%'
          OR cs.name ILIKE '%drug%adherence%'
          THEN 'MEDICATION_ADHERENCE'
        WHEN cs.name ILIKE '%lifestyle%'
          OR cs.name ILIKE '%healthy%lifestyle%'
          OR cs.name ILIKE '%diet%'
          OR cs.name ILIKE '%nutrition%'
          OR cs.name ILIKE '%physical%activity%'
          THEN 'LIFESTYLE'
      END
      FROM public.counselling_sections cs
      WHERE ci.section_id = cs.id
        AND ci.category IS NULL
        AND ci.is_active = true
        AND (
          cs.name ILIKE '%danger%sign%' OR cs.name ILIKE '%warning%sign%'
          OR cs.name ILIKE '%referral%'
          OR cs.name ILIKE '%medication%adherence%'
          OR cs.name ILIKE '%treatment%adherence%'
          OR cs.name ILIKE '%medication%safety%'
          OR cs.name ILIKE '%drug%adherence%'
          OR cs.name ILIKE '%lifestyle%'
          OR cs.name ILIKE '%diet%'
          OR cs.name ILIKE '%nutrition%'
          OR cs.name ILIKE '%physical%activity%'
        )
    `);

    this.logger.log('CDSE schema migrations complete');
  }

  // ── Item category lookups ───────────────────────────────────────────────────

  async getItemCategories(itemIds: string[]): Promise<Map<string, string>> {
    if (itemIds.length === 0) return new Map();
    const res = await this.db.query<{ id: string; category: string }>(
      `SELECT id, category
       FROM public.counselling_items
       WHERE id = ANY($1) AND category IS NOT NULL`,
      [itemIds],
    );
    return new Map(res.rows.map((r) => [r.id, r.category]));
  }

  // ── Activity context lookup ─────────────────────────────────────────────────

  async getActivityInfo(
    activityId: string,
  ): Promise<{ citizenId: string; disease: string | null } | null> {
    const res = await this.db.query<{ citizen_id: string; disease: string | null }>(
      `SELECT e.citizen_id, d.name AS disease
       FROM public.worklist_items w
       JOIN public.enrollments e ON e.id = w.enrollment_id
       LEFT JOIN public.diseases d ON d.id = e.disease_id
       WHERE w.id = $1
       LIMIT 1`,
      [activityId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return { citizenId: row.citizen_id, disease: row.disease };
  }

  // ── Alert persistence ───────────────────────────────────────────────────────

  async createAlert(
    citizenId: string,
    activityId: string,
    disease: string | null,
    riskLevel: 'MODERATE' | 'SEVERE',
  ): Promise<ClinicalAlert> {
    const res = await this.db.query<{
      id: string;
      citizen_id: string;
      activity_id: string | null;
      disease: string | null;
      risk_level: string;
      status: string;
      triggered_at: Date;
      resolved_at: Date | null;
    }>(
      `INSERT INTO public.clinical_alerts
         (citizen_id, activity_id, disease, risk_level)
       VALUES ($1, $2, $3, $4)
       RETURNING id, citizen_id, activity_id, disease, risk_level, status,
                 triggered_at, resolved_at`,
      [citizenId, activityId, disease, riskLevel],
    );
    return this.mapAlert(res.rows[0]);
  }

  async resolveAlerts(
    citizenId: string,
    disease: string | null,
    resolvedBy?: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE public.clinical_alerts
       SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = $3
       WHERE citizen_id = $1
         AND status = 'ACTIVE'
         AND ($2::text IS NULL OR disease = $2)`,
      [citizenId, disease, resolvedBy ?? 'system'],
    );
  }

  // ── Alert reads ─────────────────────────────────────────────────────────────

  async getActiveAlerts(citizenId: string): Promise<ClinicalAlert[]> {
    const res = await this.db.query<{
      id: string;
      citizen_id: string;
      activity_id: string | null;
      disease: string | null;
      risk_level: string;
      status: string;
      triggered_at: Date;
      resolved_at: Date | null;
    }>(
      `SELECT id, citizen_id, activity_id, disease, risk_level, status,
              triggered_at, resolved_at
       FROM public.clinical_alerts
       WHERE citizen_id = $1 AND status = 'ACTIVE'
       ORDER BY triggered_at DESC`,
      [citizenId],
    );
    return res.rows.map((r) => this.mapAlert(r));
  }

  async getAllAlerts(citizenId: string): Promise<ClinicalAlert[]> {
    const res = await this.db.query<{
      id: string;
      citizen_id: string;
      activity_id: string | null;
      disease: string | null;
      risk_level: string;
      status: string;
      triggered_at: Date;
      resolved_at: Date | null;
    }>(
      `SELECT id, citizen_id, activity_id, disease, risk_level, status,
              triggered_at, resolved_at
       FROM public.clinical_alerts
       WHERE citizen_id = $1
       ORDER BY triggered_at DESC
       LIMIT 20`,
      [citizenId],
    );
    return res.rows.map((r) => this.mapAlert(r));
  }

  async getActiveAlertsForBell(limit = 20): Promise<AlertWithCitizen[]> {
    const res = await this.db.query<{
      id: string;
      citizen_id: string;
      activity_id: string | null;
      disease: string | null;
      risk_level: string;
      status: string;
      triggered_at: Date;
      resolved_at: Date | null;
      citizen_name: string | null;
      uhid: string | null;
    }>(
      `SELECT ca.id, ca.citizen_id, ca.activity_id, ca.disease, ca.risk_level,
              ca.status, ca.triggered_at, ca.resolved_at,
              c.full_name AS citizen_name, c.uhid
       FROM public.clinical_alerts ca
       JOIN public.citizens c ON c.id = ca.citizen_id
       WHERE ca.status = 'ACTIVE'
       ORDER BY ca.triggered_at DESC
       LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => ({
      ...this.mapAlert(r),
      citizenName: r.citizen_name,
      uhid: r.uhid,
    }));
  }

  async hasAnyConsultation(citizenId: string): Promise<boolean> {
    const res = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM public.outcome_records orec
         JOIN public.worklist_items w ON w.id = orec.worklist_item_id
         JOIN public.enrollments e ON e.id = w.enrollment_id
         WHERE e.citizen_id = $1
       ) AS exists`,
      [citizenId],
    );
    return res.rows[0]?.exists ?? false;
  }

  // ── Worklist risk enrichment ────────────────────────────────────────────────

  async getRiskMapForCitizens(
    citizenIds: string[],
  ): Promise<Map<string, { riskLevel: string; disease: string | null }>> {
    if (citizenIds.length === 0) return new Map();
    const res = await this.db.query<{
      citizen_id: string;
      risk_level: string;
      disease: string | null;
    }>(
      `SELECT DISTINCT ON (citizen_id) citizen_id, risk_level, disease
       FROM public.clinical_alerts
       WHERE citizen_id = ANY($1) AND status = 'ACTIVE'
       ORDER BY citizen_id, triggered_at DESC`,
      [citizenIds],
    );
    return new Map(res.rows.map((r) => [r.citizen_id, { riskLevel: r.risk_level, disease: r.disease }]));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private mapAlert(row: {
    id: string;
    citizen_id: string;
    activity_id: string | null;
    disease: string | null;
    risk_level: string;
    status: string;
    triggered_at: Date;
    resolved_at: Date | null;
  }): ClinicalAlert {
    return {
      id: row.id,
      citizenId: row.citizen_id,
      activityId: row.activity_id,
      disease: row.disease,
      riskLevel: row.risk_level as 'MODERATE' | 'SEVERE',
      status: row.status as 'ACTIVE' | 'RESOLVED',
      triggeredAt: row.triggered_at.toISOString(),
      resolvedAt: row.resolved_at?.toISOString() ?? null,
    };
  }
}
