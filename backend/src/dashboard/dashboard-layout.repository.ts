import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { DashboardLayoutDto, LayoutItem } from './dashboard.types';

/**
 * Read/write access to the `dashboard_layouts` table.
 *
 * One row per role. Administrators upsert a role's row; every user with that
 * role reads from the same row on their next page load.
 *
 * The table is created idempotently on startup via onModuleInit so no manual
 * SQL migration is required on new installations.
 */
@Injectable()
export class DashboardLayoutRepository implements OnModuleInit {
  private readonly logger = new Logger(DashboardLayoutRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS dinc_app.dashboard_layouts (
        role        VARCHAR(50)  PRIMARY KEY,
        layout      JSONB        NOT NULL DEFAULT '[]',
        updated_by  VARCHAR(100),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);
  }

  /** Returns the stored layout for a role, or null if no row exists yet. */
  async findByRole(role: string): Promise<DashboardLayoutDto | null> {
    try {
      const result = await this.db.query<{
        role: string;
        layout: LayoutItem[];
        updated_by: string | null;
        updated_at: Date | null;
      }>(
        `SELECT role, layout, updated_by, updated_at
         FROM dashboard_layouts
         WHERE role = $1`,
        [role],
      );
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return {
        role: row.role,
        layout: Array.isArray(row.layout) ? row.layout : [],
        updatedBy: row.updated_by,
        updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
      };
    } catch (error) {
      this.logger.warn(
        `Layout fetch failed for role "${role}": ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Creates or replaces the layout for a role. Uses UPSERT so the admin can
   * call this multiple times without accumulating duplicate rows.
   */
  async upsert(
    role: string,
    layout: LayoutItem[],
    updatedBy: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO dashboard_layouts (role, layout, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (role) DO UPDATE
         SET layout     = EXCLUDED.layout,
             updated_by = EXCLUDED.updated_by,
             updated_at = EXCLUDED.updated_at`,
      [role, JSON.stringify(layout), updatedBy],
    );
  }
}
