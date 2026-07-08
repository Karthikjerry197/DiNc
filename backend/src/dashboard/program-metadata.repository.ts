import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * Owns `program_display_config` — the *presentation* metadata for programmes
 * (colour indicator + display order used by the Programme Summary strip).
 *
 * This is UI presentation metadata, NOT intrinsic programme data, so it lives in
 * its own configuration table keyed by `program_id` rather than polluting the
 * `public.programs` master table (which stays limited to intrinsic business
 * data: code, name, description, is_active). An administrator can recolour or
 * reorder a programme here without ever touching the business entity.
 *
 * Provisioning is ADDITIVE and idempotent (`CREATE TABLE IF NOT EXISTS` + a
 * one-time default seed) — never a drop, rename, or destructive migration —
 * following the project's plain-`pg` + `OnModuleInit` convention.
 *
 * Scaling to multiple dashboards (State / District / CHC / PHC / Care Manager /
 * Clinical / Analytics): this table is the GLOBAL DEFAULT presentation tier and
 * is intentionally keyed by `program_id` alone. When a second dashboard needs a
 * *different* programme ordering or visibility, DO NOT add a `dashboard_key` to
 * this table (that would force a destructive PK change). Instead add a separate
 * OVERRIDE tier — e.g. `dashboard_program_config(dashboard_key, program_id,
 * display_order, visible, color_override, icon, …)` — and layer it with
 * `COALESCE(override, default)` in the query. Dashboards with no override rows
 * inherit these defaults (zero duplication). Colour/icon are brand-stable per
 * programme and belong here in the default tier; only ordering/visibility
 * typically vary per dashboard. This keeps the whole evolution additive.
 */
@Injectable()
export class ProgramMetadataRepository implements OnModuleInit {
  private readonly logger = new Logger(ProgramMetadataRepository.name);

  /**
   * Neutral default palette used ONLY to seed a stable, distinct colour for
   * programmes that have no config row yet. The seeded value is written into
   * `program_display_config`, which remains the single source of truth — an
   * administrator can override any programme's colour afterwards and it is never
   * reset (the seed only inserts missing rows). The palette is a design token,
   * not per-programme business config: it maps a programme's ordinal position to
   * a hue without referencing any programme name in code.
   */
  private static readonly SEED_PALETTE: readonly string[] = [
    '#ef4444', // red
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#6366f1', // indigo
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#22c55e', // green
    '#f59e0b', // amber
    '#a855f7', // purple
    '#14b8a6', // teal
    '#0ea5e9', // sky
    '#f43f5e', // rose
  ];

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      // Separate presentation-config table — keyed to the programme, cascades if
      // the programme is ever removed. Never extends the programmes master table.
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS public.program_display_config (
          program_id    UUID PRIMARY KEY
                        REFERENCES public.programs(id) ON DELETE CASCADE,
          color         VARCHAR(9),
          display_order INTEGER,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // One-time default seed: give every programme without a config row a
      // stable, distinct colour derived from its alphabetical ordinal.
      // Idempotent — programmes that already have a config row are left untouched
      // (ON CONFLICT DO NOTHING), so admin overrides are never overwritten.
      await this.db.query(
        `WITH palette AS (
           SELECT (ord - 1) AS idx, hex
           FROM unnest($1::text[]) WITH ORDINALITY AS p(hex, ord)
         ),
         ranked AS (
           SELECT id, (row_number() OVER (ORDER BY name) - 1) AS rn
           FROM public.programs
         )
         INSERT INTO public.program_display_config (program_id, color)
         SELECT r.id, pl.hex
           FROM ranked r
           JOIN palette pl ON pl.idx = (r.rn % $2::int)
         ON CONFLICT (program_id) DO NOTHING`,
        [
          [...ProgramMetadataRepository.SEED_PALETTE],
          ProgramMetadataRepository.SEED_PALETTE.length,
        ],
      );
    } catch (error) {
      // Provisioning must never crash startup; the Programme Summary degrades
      // to an uncoloured/count-ordered state if this fails on an unusual install.
      this.logger.warn(
        `Programme display config provisioning skipped: ${(error as Error).message}`,
      );
    }
  }
}
