import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ImportGuidebookDto } from './dto/import-guidebook.dto';
import {
  BulkGuidebookRowResult,
  BulkImportResult,
  GuidebookDetail,
  GuidebookListItem,
  GuidebookRef,
  GuidebookResolution,
  GuidebookSections,
  GuidebookVersion,
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
    await this.migrateGuidebookVersions();
  }

  /**
   * Creates the guidebook_versions table (idempotent) and backfills version 1
   * (action BASELINE, no author) for any guidebook that has no history yet, so
   * every guidebook always has at least one version. New imports write version 1
   * themselves (action IMPORTED); future edit paths call recordVersion() and
   * automatically produce version 2, 3, … — no further schema work needed.
   */
  private async migrateGuidebookVersions(): Promise<void> {
    try {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS dinc_app.guidebook_versions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          guidebook_id UUID NOT NULL
            /* TODO(Step 2+): restore FK to migrated dinc_runtime/dinc_metadata table */,
          version_number INTEGER NOT NULL,
          action VARCHAR(20) NOT NULL,
          changed_by VARCHAR(100),
          change_summary TEXT,
          snapshot JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (guidebook_id, version_number)
        )
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_guidebook_versions_guidebook
          ON dinc_app.guidebook_versions(guidebook_id, version_number DESC)
      `);

      const result = await this.db.query(`
        INSERT INTO dinc_app.guidebook_versions
          (guidebook_id, version_number, action, change_summary, snapshot, created_at)
        SELECT g.id, 1, 'BASELINE', 'Initial record', g.guidebook_sections, g.updated_at
        FROM public.guidebooks g
        WHERE NOT EXISTS (
          SELECT 1 FROM dinc_app.guidebook_versions v WHERE v.guidebook_id = g.id
        )
      `);
      if (result.rowCount) {
        this.logger.log(
          `guidebook_versions baseline written for ${result.rowCount} guidebook(s).`,
        );
      }
    } catch (error) {
      this.logger.error(
        `guidebook_versions migration failed: ${(error as Error).message}`,
      );
    }
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

  /**
   * Returns full detail for a guidebook, or null when the id matches no record.
   *
   * `sections` is composed at read time from two sources (no data duplication):
   *   1. guidebook_sections JSONB — narrative/imported sections, in stored order.
   *   2. The guidebook's counselling protocol (16E normalized tables) — one
   *      section per counselling section (name → item bodies, in sort_order).
   * Counselling content stays in its normalized home (Admin CRUD, consultation
   * wizard, CDSE all keep reading it there); the Guidebook view reflects it live.
   *
   * Pass `includeCounselling = false` where the caller already renders the
   * counselling content itself (e.g. the consultation workspace wizard).
   */
  async detail(
    id: string,
    includeCounselling = true,
  ): Promise<GuidebookDetail | null> {
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
        version: number | null;
      }>(
        `SELECT g.id, g.code, g.category, g.title, g.summary, g.key_steps,
                g.escalation_criteria, g.source, g.is_active, g.updated_at,
                g.guidebook_sections,
                (SELECT MAX(v.version_number)
                 FROM dinc_app.guidebook_versions v
                 WHERE v.guidebook_id = g.id) AS version
         FROM public.guidebooks g
         WHERE g.id = $1
         LIMIT 1`,
        [id],
      );
      const row = result.rows[0];
      if (!row) return null;
      const stored = GuidebooksService.parseSections(row.guidebook_sections);
      const counselling = includeCounselling
        ? await this.counsellingSections(id)
        : {};
      return {
        id: row.id,
        code: row.code,
        category: row.category,
        title: row.title,
        status: row.is_active ? 'Active' : 'Inactive',
        updatedAt: row.updated_at.toISOString(),
        version: row.version,
        summary: row.summary,
        evidenceSource: row.source,
        keyRecommendations: GuidebooksService.toList(row.key_steps),
        referralCriteria: GuidebooksService.toList(row.escalation_criteria),
        sections: { ...stored, ...counselling },
      };
    } catch (error) {
      this.logger.warn(`Guidebook detail query failed: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Imports a new guidebook ("New Protocol") into the existing table. Reuses the
   * guidebook_sections JSONB column verbatim — no new storage format. Section
   * names are arbitrary and preserved as given; the row renders through the same
   * data-driven detail path as every other guidebook.
   */
  async create(
    input: ImportGuidebookDto,
    changedBy: string | null = null,
  ): Promise<GuidebookListItem> {
    const code = input.code.trim();
    const dup = await this.db.query(
      `SELECT 1 FROM public.guidebooks WHERE code = $1 LIMIT 1`,
      [code],
    );
    if (dup.rows.length > 0) {
      throw new ConflictException(`A guidebook with code '${code}' already exists.`);
    }

    const sections = GuidebooksService.normalizeSections(input.sections);
    if (Object.keys(sections).length === 0) {
      throw new BadRequestException(
        'The guidebook must contain at least one section with text or list content.',
      );
    }

    const result = await this.db.query<{
      id: string;
      code: string;
      category: string;
      title: string;
      summary: string | null;
      is_active: boolean;
    }>(
      `INSERT INTO public.guidebooks (code, category, title, source, is_active, guidebook_sections)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, code, category, title, summary, is_active`,
      [
        code,
        input.category.trim(),
        input.title.trim(),
        input.source?.trim() || null,
        input.isActive ?? true,
        JSON.stringify(sections),
      ],
    );
    const row = result.rows[0];
    await this.recordVersion(row.id, 'IMPORTED', changedBy, 'Imported from JSON', sections);
    return {
      id: row.id,
      code: row.code,
      category: row.category,
      title: row.title,
      summary: row.summary,
      status: row.is_active ? 'Active' : 'Inactive',
    };
  }

  /**
   * Bulk import: each guidebook goes through the exact single-import pipeline
   * ({@link create}) independently — same validation, same duplicate-code check,
   * same version recording. Mirrors the patients bulk-registration semantics:
   * per-row atomic with a classified per-row result, never all-or-nothing.
   * Codes repeated within the payload are classified as DUPLICATE without
   * touching the database.
   */
  async bulkImport(
    inputs: ImportGuidebookDto[],
    changedBy: string | null,
  ): Promise<BulkImportResult> {
    const result: BulkImportResult = {
      total: inputs.length,
      created: 0,
      duplicate: 0,
      failed: 0,
      rows: [],
    };
    const seenCodes = new Set<string>();

    for (let i = 0; i < inputs.length; i += 1) {
      const input = inputs[i];
      const code = input.code.trim();
      const row: BulkGuidebookRowResult = {
        row: i + 1,
        code: code || null,
        title: input.title?.trim() || null,
        status: 'CREATED',
        reason: null,
      };

      if (seenCodes.has(code.toUpperCase())) {
        row.status = 'DUPLICATE';
        row.reason = 'Code repeated within the uploaded file.';
      } else {
        seenCodes.add(code.toUpperCase());
        try {
          await this.create(input, changedBy);
        } catch (error) {
          if (error instanceof ConflictException) {
            row.status = 'DUPLICATE';
          } else {
            row.status = 'FAILED';
          }
          row.reason =
            error instanceof Error ? error.message : 'Import failed.';
        }
      }

      if (row.status === 'CREATED') result.created += 1;
      else if (row.status === 'DUPLICATE') result.duplicate += 1;
      else result.failed += 1;
      result.rows.push(row);
    }
    return result;
  }

  /** Version history for a guidebook, newest first. */
  async versions(guidebookId: string): Promise<GuidebookVersion[]> {
    try {
      const result = await this.db.query<{
        version_number: number;
        action: string;
        changed_by: string | null;
        change_summary: string | null;
        created_at: Date;
      }>(
        `SELECT version_number, action, changed_by, change_summary, created_at
         FROM dinc_app.guidebook_versions
         WHERE guidebook_id = $1
         ORDER BY version_number DESC`,
        [guidebookId],
      );
      return result.rows.map((row) => ({
        versionNumber: row.version_number,
        action: row.action,
        changedBy: row.changed_by,
        changeSummary: row.change_summary,
        createdAt: row.created_at.toISOString(),
      }));
    } catch (error) {
      this.logger.warn(
        `Guidebook versions query failed: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Appends the next version row for a guidebook (MAX + 1, starting at 1).
   * Every future write path (edit, section update, …) should call this after
   * persisting its change so history accrues automatically. Failures are logged
   * but never fail the underlying write.
   */
  private async recordVersion(
    guidebookId: string,
    action: string,
    changedBy: string | null,
    changeSummary: string | null,
    snapshot: GuidebookSections | null,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO dinc_app.guidebook_versions
           (guidebook_id, version_number, action, changed_by, change_summary, snapshot)
         VALUES (
           $1,
           COALESCE((SELECT MAX(version_number) FROM dinc_app.guidebook_versions
                     WHERE guidebook_id = $1), 0) + 1,
           $2, $3, $4, $5::jsonb
         )`,
        [
          guidebookId,
          action,
          changedBy,
          changeSummary,
          snapshot ? JSON.stringify(snapshot) : null,
        ],
      );
    } catch (error) {
      this.logger.warn(
        `Version record failed for guidebook ${guidebookId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Live read-time projection of the guidebook's counselling protocol content
   * (16E: counselling_protocols → counselling_sections → counselling_items)
   * into the data-driven section map: section name → item bodies in sort_order.
   * Mirrors the resolution semantics of the consultation repository's
   * findCounsellingSections: the first active protocol's sections, with a legacy
   * fallback to sections attached directly to the guidebook. Sections without
   * active items are omitted (no content to display). Returns {} on any error
   * or for guidebooks with no counselling content (e.g. JSON-imported ones),
   * which leaves the JSONB-stored sections untouched.
   */
  private async counsellingSections(
    guidebookId: string,
  ): Promise<GuidebookSections> {
    try {
      const result = await this.db.query<{
        section_name: string;
        item_body: string;
      }>(
        `SELECT cs.name AS section_name, ci.body AS item_body
         FROM   dinc_app.counselling_sections cs
         JOIN   dinc_app.counselling_items ci
                  ON ci.section_id = cs.id AND ci.is_active = true
         WHERE  cs.is_active = true
           AND  (
                 cs.protocol_id = (
                   SELECT id FROM dinc_app.counselling_protocols
                   WHERE  guidebook_id = $1 AND is_active = true
                   ORDER  BY sort_order ASC LIMIT 1
                 )
                 OR
                 (
                   cs.protocol_id IS NULL
                   AND cs.guidebook_id = $1
                   AND NOT EXISTS (
                     SELECT 1 FROM dinc_app.counselling_protocols
                     WHERE guidebook_id = $1 AND is_active = true
                   )
                 )
               )
         ORDER  BY cs.sort_order, ci.sort_order`,
        [guidebookId],
      );
      const sections: GuidebookSections = {};
      for (const row of result.rows) {
        const items = sections[row.section_name];
        if (Array.isArray(items)) {
          items.push(row.item_body);
        } else {
          sections[row.section_name] = [row.item_body];
        }
      }
      return sections;
    } catch (error) {
      this.logger.warn(
        `Counselling sections query failed: ${(error as Error).message}`,
      );
      return {};
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

  /** Shown when a clinical context resolves to no guidebook at all. */
  static readonly NO_MAPPING_MESSAGE =
    'No guidebook is currently mapped for this programme.';

  /**
   * Resolves the guidebook(s) for a clinical context using the configurable
   * `public.guidebook_mappings` table (Programme / Disease / Event → Guidebook).
   *
   * Ordering (highest priority first): the mapping row's `priority` ascending
   * (lower number = higher priority), then scope specificity (EVENT is more
   * specific than DISEASE, DISEASE than PROGRAMME) as a tie-breaker, then title.
   * The first result is opened automatically; the rest become "Related
   * Guidebooks". Duplicate guidebooks (mapped at more than one scope) are
   * collapsed to their best-ranked entry.
   *
   * The lookup is defensive: if the mapping table is absent or a query fails, it
   * falls back to the existing curated `guide_rules` text match so the feature
   * never regresses. When nothing matches at all, `matched` is false and a
   * friendly {@link NO_MAPPING_MESSAGE} is returned.
   *
   * This method contains no hardcoded programme/disease/guidebook associations —
   * every mapping is data in PostgreSQL.
   */
  async resolveForContext(ctx: {
    programId: string | null;
    diseaseId: string | null;
    eventId: string | null;
    haystack: string;
  }): Promise<GuidebookResolution> {
    const mapped = await this.matchByMappings(ctx.programId, ctx.diseaseId, ctx.eventId);
    if (mapped.length > 0) {
      const [primary, ...related] = mapped;
      return { guidebook: primary, related, matched: true, message: null };
    }

    // Fallback: existing curated regex rules (keeps legacy matches working).
    const legacy = await this.matchByText(ctx.haystack);
    if (legacy) {
      return { guidebook: legacy, related: [], matched: true, message: null };
    }

    return {
      guidebook: null,
      related: [],
      matched: false,
      message: GuidebooksService.NO_MAPPING_MESSAGE,
    };
  }

  /**
   * Ordered, de-duplicated list of guidebooks mapped to the given context via
   * public.guidebook_mappings. Returns [] when the table does not exist yet (so
   * resolveForContext can fall back) — a missing table is logged, not thrown.
   */
  private async matchByMappings(
    programId: string | null,
    diseaseId: string | null,
    eventId: string | null,
  ): Promise<GuidebookRef[]> {
    if (!programId && !diseaseId && !eventId) return [];
    try {
      const result = await this.db.query<GuidebookRef>(
        `SELECT g.id, g.code, g.category, g.title
         FROM public.guidebook_mappings gm
         JOIN public.guidebooks g ON g.id = gm.guidebook_id AND g.is_active = true
         WHERE gm.is_active = true
           AND (
                 (gm.scope = 'EVENT'     AND gm.event_id   = $3::uuid) OR
                 (gm.scope = 'DISEASE'   AND gm.disease_id = $2::uuid) OR
                 (gm.scope = 'PROGRAMME' AND gm.program_id = $1::uuid)
               )
         ORDER BY gm.priority ASC,
                  CASE gm.scope WHEN 'EVENT' THEN 1 WHEN 'DISEASE' THEN 2 ELSE 3 END ASC,
                  g.title ASC`,
        [programId, diseaseId, eventId],
      );
      // Collapse a guidebook mapped at multiple scopes to its best-ranked entry.
      const seen = new Set<string>();
      const unique: GuidebookRef[] = [];
      for (const row of result.rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        unique.push(row);
      }
      return unique;
    } catch (error) {
      this.logger.warn(
        `Guidebook mappings query skipped (${(error as Error).message}). ` +
          `Falling back to curated text rules.`,
      );
      return [];
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

  /**
   * Normalizes an imported section map into the stored shape: trims keys and
   * values, keeps only non-empty strings and non-empty string arrays, and drops
   * anything else. Same value rules as {@link parseSections}, applied on write so
   * the stored JSONB is always clean. Key order is preserved as provided.
   */
  private static normalizeSections(
    raw: Record<string, unknown> | null | undefined,
  ): GuidebookSections {
    const sections: GuidebookSections = {};
    for (const [key, val] of Object.entries(raw ?? {})) {
      const k = key.trim();
      if (!k) continue;
      if (typeof val === 'string') {
        const text = val.trim();
        if (text) sections[k] = text;
      } else if (Array.isArray(val)) {
        const items = val
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (items.length > 0) sections[k] = items;
      }
    }
    return sections;
  }
}
