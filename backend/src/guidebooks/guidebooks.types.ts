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
