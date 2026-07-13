import type { ReactNode } from 'react';
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
  /** Icon (Lucide element) shown in Widget Library and the frame header. */
  icon: ReactNode;
  category: WidgetCategory;
  defaultColSpan: ColSpan;
}

// M40 Configuration Convergence: the hardcoded KNOWN_ROLES list was retired.
// Role pickers now read from the rbac_roles single source of truth via useRoles().
