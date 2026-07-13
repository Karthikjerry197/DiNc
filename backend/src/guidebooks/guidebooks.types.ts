/**
 * Shapes returned by the read-only Guidebooks endpoints.
 */

/** A lightweight reference to a guidebook, used by the context-aware resolver. */
export interface GuidebookRef {
  id: string;
  code: string;
  category: string;
  title: string;
}

/**
 * The three configurable mapping scopes (public.guidebook_mappings.scope).
 * PROGRAMME and DISEASE are used today; EVENT is future-ready (a worklist item
 * already carries an event, so event-level mappings resolve automatically once
 * an administrator adds them).
 */
export type GuidebookMappingScope = 'PROGRAMME' | 'DISEASE' | 'EVENT';

/**
 * The result of resolving the guidebook(s) for a clinical context
 * (programme / disease / event). `guidebook` is the highest-priority match that
 * the caller should open automatically; `related` lists the other applicable
 * guidebooks. When nothing is mapped, `matched` is false and `message` carries a
 * friendly, display-ready explanation.
 */
export interface GuidebookResolution {
  guidebook: GuidebookRef | null;
  related: GuidebookRef[];
  matched: boolean;
  message: string | null;
}

export interface GuidebookListItem {
  id: string;
  code: string;
  category: string;
  title: string;
  summary: string | null;
  status: 'Active' | 'Inactive';
}

/**
 * Fully data-driven section map from the guidebook_sections JSONB column.
 * Keys are arbitrary strings (e.g. "checklist", "counsellingPoints", "drugChart").
 * Values are either a text string or an ordered string array.
 * Adding new section types in the database requires no frontend code changes.
 */
export type GuidebookSections = Record<string, string | string[]>;

export interface GuidebookDetail {
  id: string;
  code: string;
  category: string;
  title: string;
  status: 'Active' | 'Inactive';
  updatedAt: string;
  /** Current version number (max in guidebook_versions), or null when unversioned. */
  version: number | null;
  /** Legacy columns — always present, may be empty. */
  summary: string | null;
  evidenceSource: string | null;
  keyRecommendations: string[];
  referralCriteria: string[];
  /**
   * Structured sections from guidebook_sections JSONB (16A+).
   * Empty object on legacy rows that have not been enriched yet.
   * The UI renders whatever keys are present — no hardcoded section list.
   */
  sections: GuidebookSections;
}

/** One entry in a guidebook's version history (guidebook_versions row). */
export interface GuidebookVersion {
  versionNumber: number;
  /** What produced this version, e.g. 'BASELINE' (backfill) or 'IMPORTED'. */
  action: string;
  changedBy: string | null;
  changeSummary: string | null;
  createdAt: string;
}

/** Per-guidebook outcome classification for bulk import. */
export type BulkGuidebookStatus = 'CREATED' | 'DUPLICATE' | 'FAILED';

export interface BulkGuidebookRowResult {
  row: number;
  code: string | null;
  title: string | null;
  status: BulkGuidebookStatus;
  reason: string | null;
}

export interface BulkImportResult {
  total: number;
  created: number;
  duplicate: number;
  failed: number;
  rows: BulkGuidebookRowResult[];
}
