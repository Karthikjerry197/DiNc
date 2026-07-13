import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  REFERENCE_SEED,
  ReferenceCategoryRow,
  ReferenceValueRow,
} from './reference-data.types';

/**
 * Data-access layer for the Reference Data framework. Owns two additive tables
 * (`reference_categories`, `reference_values`) created idempotently on boot, and
 * seeds the migrated vocabularies once so administrator edits are never
 * overwritten. Every statement is parameterised. This is the ONLY file with SQL
 * for the feature; the schema is generic so new categories NEVER need DDL.
 */
@Injectable()
export class ReferenceDataRepository implements OnModuleInit {
  private readonly logger = new Logger(ReferenceDataRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.migrate();
      await this.seed();
    } catch (error) {
      this.logger.error(`Reference data provisioning failed: ${(error as Error).message}`);
    }
  }

  // ── DDL (additive, idempotent) ──────────────────────────────────────────────

  private async migrate(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS dinc_app.reference_categories (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        key           TEXT        NOT NULL UNIQUE,
        name          TEXT        NOT NULL,
        description   TEXT,
        is_active     BOOLEAN     NOT NULL DEFAULT true,
        is_system     BOOLEAN     NOT NULL DEFAULT false,
        display_order INT         NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS dinc_app.reference_values (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id  UUID        NOT NULL REFERENCES dinc_app.reference_categories(id) ON DELETE CASCADE,
        code         TEXT        NOT NULL,
        display_name TEXT        NOT NULL,
        description  TEXT,
        colour       TEXT,
        icon         TEXT,
        sort_order   INT         NOT NULL DEFAULT 0,
        is_active    BOOLEAN     NOT NULL DEFAULT true,
        is_system    BOOLEAN     NOT NULL DEFAULT false,
        metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (category_id, code)
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_reference_values_category
        ON dinc_app.reference_values (category_id, sort_order)
    `);
  }

  // ── Seed (definitional presence; never clobbers admin edits) ────────────────

  private async seed(): Promise<void> {
    for (let ci = 0; ci < REFERENCE_SEED.length; ci += 1) {
      const cat = REFERENCE_SEED[ci];
      const inserted = await this.db.query<{ id: string }>(
        `INSERT INTO dinc_app.reference_categories (key, name, description, is_system, display_order)
         VALUES ($1, $2, $3, true, $4)
         ON CONFLICT (key) DO NOTHING
         RETURNING id`,
        [cat.key, cat.name, cat.description, ci],
      );
      // Resolve the category id whether it was just inserted or already existed.
      const idRes = inserted.rows[0]
        ? inserted
        : await this.db.query<{ id: string }>(
            `SELECT id FROM dinc_app.reference_categories WHERE key = $1`,
            [cat.key],
          );
      const categoryId = idRes.rows[0]?.id;
      if (!categoryId) continue;

      for (let vi = 0; vi < cat.values.length; vi += 1) {
        const v = cat.values[vi];
        await this.db.query(
          `INSERT INTO dinc_app.reference_values
             (category_id, code, display_name, description, colour, icon, sort_order, is_system, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8::jsonb)
           ON CONFLICT (category_id, code) DO NOTHING`,
          [
            categoryId,
            v.code,
            v.displayName,
            v.description ?? null,
            v.colour ?? null,
            v.icon ?? null,
            vi,
            JSON.stringify(v.metadata ?? {}),
          ],
        );
      }
    }
  }

  // ── Reads ───────────────────────────────────────────────────────────────────

  async listCategories(activeOnly: boolean): Promise<ReferenceCategoryRow[]> {
    const result = await this.db.query<ReferenceCategoryRow>(
      `SELECT c.*, count(v.id) FILTER (WHERE v.id IS NOT NULL) AS value_count
       FROM dinc_app.reference_categories c
       LEFT JOIN dinc_app.reference_values v ON v.category_id = c.id
       ${activeOnly ? 'WHERE c.is_active = true' : ''}
       GROUP BY c.id
       ORDER BY c.display_order, c.name`,
    );
    return result.rows;
  }

  async findCategory(idOrKey: string): Promise<ReferenceCategoryRow | null> {
    const result = await this.db.query<ReferenceCategoryRow>(
      `SELECT * FROM dinc_app.reference_categories
       WHERE id::text = $1 OR key = lower($1) LIMIT 1`,
      [idOrKey],
    );
    return result.rows[0] ?? null;
  }

  /** Values for a category (by id or key). `activeOnly` filters inactive out. */
  async listValues(idOrKey: string, activeOnly: boolean): Promise<ReferenceValueRow[]> {
    const result = await this.db.query<ReferenceValueRow>(
      `SELECT v.*, c.key AS category_key
       FROM dinc_app.reference_values v
       JOIN dinc_app.reference_categories c ON c.id = v.category_id
       WHERE (c.id::text = $1 OR c.key = lower($1))
         ${activeOnly ? 'AND v.is_active = true' : ''}
       ORDER BY v.sort_order, v.display_name`,
      [idOrKey],
    );
    return result.rows;
  }

  async findValue(id: string): Promise<ReferenceValueRow | null> {
    const result = await this.db.query<ReferenceValueRow>(
      `SELECT v.*, c.key AS category_key
       FROM dinc_app.reference_values v
       JOIN dinc_app.reference_categories c ON c.id = v.category_id
       WHERE v.id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  // ── Category writes ─────────────────────────────────────────────────────────

  async createCategory(input: {
    key: string;
    name: string;
    description: string | null;
  }): Promise<ReferenceCategoryRow> {
    const nextOrder = await this.db.query<{ n: number }>(
      `SELECT COALESCE(max(display_order), -1) + 1 AS n FROM dinc_app.reference_categories`,
    );
    const result = await this.db.query<ReferenceCategoryRow>(
      `INSERT INTO dinc_app.reference_categories (key, name, description, display_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.key, input.name, input.description, nextOrder.rows[0]?.n ?? 0],
    );
    return result.rows[0];
  }

  async updateCategory(
    idOrKey: string,
    patch: { name?: string; description?: string | null; isActive?: boolean },
  ): Promise<ReferenceCategoryRow | null> {
    const cat = await this.findCategory(idOrKey);
    if (!cat) return null;
    const sets: string[] = [];
    const vals: unknown[] = [cat.id];
    const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
    if (patch.name !== undefined) add('name', patch.name);
    if (patch.description !== undefined) add('description', patch.description);
    if (patch.isActive !== undefined) add('is_active', patch.isActive);
    if (sets.length === 0) return cat;
    const result = await this.db.query<ReferenceCategoryRow>(
      `UPDATE dinc_app.reference_categories SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $1 RETURNING *`,
      vals,
    );
    return result.rows[0] ?? null;
  }

  /** Soft delete: deactivate the category (never a hard delete). */
  async deactivateCategory(idOrKey: string): Promise<ReferenceCategoryRow | null> {
    return this.updateCategory(idOrKey, { isActive: false });
  }

  // ── Value writes ────────────────────────────────────────────────────────────

  async createValue(
    categoryId: string,
    input: {
      code: string;
      displayName: string;
      description: string | null;
      colour: string | null;
      icon: string | null;
      metadata: Record<string, unknown>;
    },
  ): Promise<ReferenceValueRow> {
    const nextOrder = await this.db.query<{ n: number }>(
      `SELECT COALESCE(max(sort_order), -1) + 1 AS n
       FROM dinc_app.reference_values WHERE category_id = $1`,
      [categoryId],
    );
    const result = await this.db.query<ReferenceValueRow>(
      `INSERT INTO dinc_app.reference_values
         (category_id, code, display_name, description, colour, icon, sort_order, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      [
        categoryId,
        input.code,
        input.displayName,
        input.description,
        input.colour,
        input.icon,
        nextOrder.rows[0]?.n ?? 0,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return result.rows[0];
  }

  async updateValue(
    id: string,
    patch: {
      displayName?: string;
      description?: string | null;
      colour?: string | null;
      icon?: string | null;
      isActive?: boolean;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ReferenceValueRow | null> {
    const sets: string[] = [];
    const vals: unknown[] = [id];
    const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
    if (patch.displayName !== undefined) add('display_name', patch.displayName);
    if (patch.description !== undefined) add('description', patch.description);
    if (patch.colour !== undefined) add('colour', patch.colour);
    if (patch.icon !== undefined) add('icon', patch.icon);
    if (patch.isActive !== undefined) add('is_active', patch.isActive);
    if (patch.metadata !== undefined) {
      vals.push(JSON.stringify(patch.metadata));
      sets.push(`metadata = $${vals.length}::jsonb`);
    }
    if (sets.length === 0) return this.findValue(id);
    const result = await this.db.query<ReferenceValueRow>(
      `UPDATE dinc_app.reference_values SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $1 RETURNING *`,
      vals,
    );
    return result.rows[0] ?? null;
  }

  /** Soft delete: deactivate the value (never a hard delete). */
  async deactivateValue(id: string): Promise<ReferenceValueRow | null> {
    return this.updateValue(id, { isActive: false });
  }

  /** Apply a new ordering: `orderedIds` is the desired top-to-bottom sequence. */
  async reorderValues(categoryId: string, orderedIds: string[]): Promise<void> {
    await this.db.withTransaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i += 1) {
        await tx.query(
          `UPDATE dinc_app.reference_values SET sort_order = $2, updated_at = now()
           WHERE id = $1 AND category_id = $3`,
          [orderedIds[i], i, categoryId],
        );
      }
    });
  }

  /** True when a value code already exists in the category (for validation). */
  async valueCodeExists(categoryId: string, code: string): Promise<boolean> {
    const res = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM dinc_app.reference_values WHERE category_id = $1 AND code = $2
       ) AS exists`,
      [categoryId, code],
    );
    return res.rows[0]?.exists ?? false;
  }
}
