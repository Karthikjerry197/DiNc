/**
 * Dashboard Studio — pure types only.
 *
 * This file contains no widget IDs, no role layouts, and no render functions.
 * Those belong exclusively in registry.tsx.
 * Adding or removing a widget never requires editing this file.
 */

// ── Grid ──────────────────────────────────────────────────────────────────────

/** Column span within the 3-column studio grid. */
export type ColSpan = 1 | 2 | 3;

// ── Widget categories ─────────────────────────────────────────────────────────

export type WidgetCategory =
  | 'Operations'
  | 'Analytics'
  | 'Clinical'
  | 'Knowledge'
  | 'Administration';

export const WIDGET_CATEGORIES: WidgetCategory[] = [
  'Operations',
  'Analytics',
  'Clinical',
  'Knowledge',
  'Administration',
];

// ── Layout item ───────────────────────────────────────────────────────────────

/** One widget slot — stored as JSONB in PostgreSQL and held in React state. */
export interface StudioLayoutItem {
  widgetId: string;
  colSpan: ColSpan;
  visible: boolean;
  collapsed: boolean;
}

// ── Widget metadata ───────────────────────────────────────────────────────────

/**
 * Identity and presentation data for a widget.
 * Extended by WidgetDefinition in registry.tsx to add render + role placement.
 */
export interface WidgetMeta {
  id: string;
  label: string;
  description: string;
  /** Emoji or icon identifier shown in Widget Library and the frame header. */
  icon: string;
  category: WidgetCategory;
  defaultColSpan: ColSpan;
}

// ── Known roles ───────────────────────────────────────────────────────────────

export const KNOWN_ROLES: { value: string; label: string }[] = [
  { value: 'ADMIN',          label: 'Admin' },
  { value: 'CLINICIAN',      label: 'Clinician' },
  { value: 'CARE_ASSISTANT', label: 'Care Assistant' },
  { value: 'ANM',            label: 'ANM' },
];
