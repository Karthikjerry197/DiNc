/**
 * Shapes returned by the read-only Guidebooks endpoints.
 *
 * Every value originates from a SELECT on the existing public.guidebooks table.
 * Fields not modelled in the schema are reported as null / empty arrays so the
 * UI renders professional empty states instead of fabricating clinical content.
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

export interface GuidebookDetail {
  id: string;
  code: string;
  category: string;
  title: string;
  status: 'Active' | 'Inactive';
  updatedAt: string;
  /** Overview content sourced directly from existing columns. */
  summary: string | null;
  evidenceSource: string | null;
  keyRecommendations: string[];
  referralCriteria: string[];
}
