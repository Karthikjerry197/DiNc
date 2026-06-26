import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  GuidebookDetail,
  GuidebookListItem,
  GuidebookRef,
} from './guidebooks.types';

/**
 * Read-only data source for the Guidebooks workspace.
 *
 * Issues only SELECT statements against the existing public.guidebooks table.
 * No writes, uploads, approvals or schema changes are performed anywhere.
 */
@Injectable()
export class GuidebooksService {
  private readonly logger = new Logger(GuidebooksService.name);

  constructor(private readonly db: DatabaseService) {}

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
      }>(
        `SELECT id, code, category, title, summary, key_steps,
                escalation_criteria, source, is_active, updated_at
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
}
