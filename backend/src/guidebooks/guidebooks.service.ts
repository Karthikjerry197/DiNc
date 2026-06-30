import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  GuidebookDetail,
  GuidebookListItem,
  GuidebookRef,
  GuidebookSections,
} from './guidebooks.types';

/**
 * Read-only data source for the Guidebooks workspace.
 *
 * On startup: idempotently adds guidebook_sections JSONB to the guidebooks
 * table (if not already present) and backfills it from the legacy text columns
 * (summary, key_steps, escalation_criteria). This completes the Milestone 16A
 * schema migration automatically without requiring a manual script run.
 */
@Injectable()
export class GuidebooksService implements OnModuleInit {
  private readonly logger = new Logger(GuidebooksService.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.migrateGuidebookSections();
  }

  /**
   * Adds guidebook_sections JSONB column (idempotent) and backfills it from
   * legacy text columns. Only updates rows where guidebook_sections IS NULL,
   * so any values already set by an administrator are never overwritten.
   *
   * Column mapping:
   *   summary             → sections.summary           (text)
   *   key_steps           → sections.checklist         (array, split on ; / newline)
   *   escalation_criteria → sections.referralGuidance  (array, split on ; / newline)
   */
  private async migrateGuidebookSections(): Promise<void> {
    try {
      await this.db.query(`
        ALTER TABLE public.guidebooks
          ADD COLUMN IF NOT EXISTS guidebook_sections JSONB
      `);

      const result = await this.db.query(`
        UPDATE public.guidebooks
        SET guidebook_sections = jsonb_strip_nulls(jsonb_build_object(
          'summary',
            CASE WHEN trim(coalesce(summary, '')) <> ''
                 THEN to_jsonb(trim(summary))
                 ELSE NULL::jsonb END,
          'checklist',
            CASE WHEN trim(coalesce(key_steps, '')) <> ''
                 THEN (
                   SELECT to_jsonb(array_agg(s ORDER BY ord))
                   FROM (
                     SELECT trim(e) AS s, row_number() OVER () AS ord
                     FROM regexp_split_to_table(key_steps, E'[;\\n]+') e
                     WHERE trim(e) <> ''
                   ) t
                 )
                 ELSE NULL::jsonb END,
          'referralGuidance',
            CASE WHEN trim(coalesce(escalation_criteria, '')) <> ''
                 THEN (
                   SELECT to_jsonb(array_agg(s ORDER BY ord))
                   FROM (
                     SELECT trim(e) AS s, row_number() OVER () AS ord
                     FROM regexp_split_to_table(escalation_criteria, E'[;\\n]+') e
                     WHERE trim(e) <> ''
                   ) t
                 )
                 ELSE NULL::jsonb END
        ))
        WHERE guidebook_sections IS NULL
      `);

      if (result.rowCount) {
        this.logger.log(
          `guidebook_sections backfilled for ${result.rowCount} guidebook(s).`,
        );
      }
    } catch (error) {
      this.logger.error(
        `guidebook_sections migration failed: ${(error as Error).message}`,
      );
    }
  }

  async list(): Promise<GuidebookListItem[]> {
    try {
      const result = await this.db.query<{
        id: string;
        code: string;
        category: string;
        title: string;
        summary: string | null;
        is_active: boolean;
      }>(
        `SELECT id, code, category, title, summary, is_active
         FROM public.guidebooks
         ORDER BY category, title
         LIMIT 200`,
      );
      return result.rows.map((row) => ({
        id: row.id,
        code: row.code,
        category: row.category,
        title: row.title,
        summary: row.summary,
        status: row.is_active ? 'Active' : 'Inactive',
      }));
    } catch (error) {
      this.logger.warn(`Guidebooks list query failed: ${(error as Error).message}`);
      return [];
    }
  }

  /** Returns full detail for a guidebook, or null when the id matches no record. */
  async detail(id: string): Promise<GuidebookDetail | null> {
    try {
      const result = await this.db.query<{
        id: string;
        code: string;
        category: string;
        title: string;
        summary: string | null;
        key_steps: string | null;
        escalation_criteria: string | null;
        source: string | null;
        is_active: boolean;
        updated_at: Date;
        guidebook_sections: unknown;
      }>(
        `SELECT id, code, category, title, summary, key_steps,
                escalation_criteria, source, is_active, updated_at,
                guidebook_sections
         FROM public.guidebooks
         WHERE id = $1
         LIMIT 1`,
        [id],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        code: row.code,
        category: row.category,
        title: row.title,
        status: row.is_active ? 'Active' : 'Inactive',
        updatedAt: row.updated_at.toISOString(),
        summary: row.summary,
        evidenceSource: row.source,
        keyRecommendations: GuidebooksService.toList(row.key_steps),
        referralCriteria: GuidebooksService.toList(row.escalation_criteria),
        sections: GuidebooksService.parseSections(row.guidebook_sections),
      };
    } catch (error) {
      this.logger.warn(`Guidebook detail query failed: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Resolves the guidebook that best matches a free-text clinical context (built
   * from a program/disease/event). Uses the existing public.guide_rules table:
   * each rule holds a regular expression and points to a guidebook; the first
   * rule (by sort_order) whose pattern matches the text wins. Returns null when
   * no curated rule matches — callers fall back to the generic Guidebooks page.
   */
  async matchByText(haystack: string): Promise<GuidebookRef | null> {
    if (!haystack || !haystack.trim()) return null;
    try {
      const result = await this.db.query<GuidebookRef>(
        `SELECT g.id, g.code, g.category, g.title
         FROM public.guide_rules gr
         JOIN public.guidebooks g ON g.id = gr.guidebook_id
         WHERE g.is_active = true AND $1 ~* gr.pattern
         ORDER BY gr.sort_order ASC
         LIMIT 1`,
        [haystack],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      this.logger.warn(`Guidebook match query failed: ${(error as Error).message}`);
      return null;
    }
  }

  /** Splits a stored "; "/newline separated string into trimmed, non-empty items. */
  private static toList(value: string | null): string[] {
    if (!value) return [];
    return value
      .split(/[;\n]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  /**
   * Parses guidebook_sections JSONB into a data-driven section map.
   * Every key found in the JSON is included — the renderer decides how to display
   * each section. String values become text paragraphs; array values become lists.
   * Keys with nested objects or null values are silently skipped.
   */
  private static parseSections(raw: unknown): GuidebookSections {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const obj = raw as Record<string, unknown>;
    const sections: GuidebookSections = {};
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string') {
        sections[key] = val;
      } else if (Array.isArray(val)) {
        const items = val.filter((s): s is string => typeof s === 'string');
        if (items.length > 0) sections[key] = items;
      }
    }
    return sections;
  }
}
