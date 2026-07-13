/**
 * Reference Data framework — generic, DB-backed business vocabularies.
 *
 * A *category* is a named vocabulary (e.g. `gender`, `priority`); a *value* is one
 * option within it (e.g. `URGENT`). Both live in PostgreSQL so administrators can
 * add/edit/deactivate/reorder options with NO code or schema change. Application
 * LOGIC (state machines, permission keys, risk ranking) stays in code — only the
 * selectable vocabularies and their display metadata are moved here.
 */

export interface ReferenceCategoryDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  displayOrder: number;
  valueCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceValueDto {
  id: string;
  categoryId: string;
  categoryKey: string;
  code: string;
  displayName: string;
  description: string | null;
  colour: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceCategoryRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
  value_count?: string;
}

export interface ReferenceValueRow {
  id: string;
  category_id: string;
  category_key?: string;
  code: string;
  display_name: string;
  description: string | null;
  colour: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

// ── Seed catalogue (mirrors the current hardcoded vocabularies) ────────────────

export interface SeedReferenceValue {
  code: string;
  displayName: string;
  description?: string;
  colour?: string;
  icon?: string;
  metadata?: Record<string, unknown>;
}

export interface SeedReferenceCategory {
  key: string;
  name: string;
  description: string;
  values: SeedReferenceValue[];
}

/**
 * Business-configuration vocabularies migrated out of code. Seeded once (values
 * are never clobbered on later boots) so administrator edits persist. The `code`
 * values are byte-for-byte identical to the previous hardcoded constants, so the
 * database is a faithful mirror and existing data keeps validating.
 */
export const REFERENCE_SEED: SeedReferenceCategory[] = [
  {
    key: 'gender',
    name: 'Gender',
    description: 'Citizen gender options used in registration and profiles.',
    values: [
      { code: 'Female', displayName: 'Female' },
      { code: 'Male', displayName: 'Male' },
      { code: 'Other', displayName: 'Other' },
    ],
  },
  {
    key: 'duplicate_reason',
    name: 'Duplicate Reason',
    description: 'Reasons a worker can select when reporting a suspected duplicate.',
    values: [
      { code: 'DUPLICATE_REGISTRATION', displayName: 'Duplicate registration' },
      { code: 'SAME_PERSON_DIFFERENT_UHID', displayName: 'Same person, different UHID' },
      { code: 'DATA_ENTRY_ERROR', displayName: 'Data entry error' },
      { code: 'MERGED_FAMILY_RECORD', displayName: 'Merged / family record' },
      { code: 'OTHER', displayName: 'Other' },
    ],
  },
  {
    key: 'priority',
    name: 'Priority',
    description: 'Activity / worklist priority levels. `rank` (metadata) orders them.',
    values: [
      { code: 'URGENT', displayName: 'Urgent', colour: '#b91c1c', metadata: { rank: 4 } },
      { code: 'HIGH', displayName: 'High', colour: '#c2410c', metadata: { rank: 3 } },
      { code: 'NORMAL', displayName: 'Normal', colour: '#0369a1', metadata: { rank: 2 } },
      { code: 'LOW', displayName: 'Low', colour: '#4b5563', metadata: { rank: 1 } },
    ],
  },
  {
    key: 'risk_level',
    name: 'Risk Level',
    description: 'Clinical risk badge display. Risk COMPUTATION stays in code (CDSE).',
    values: [
      { code: 'SEVERE', displayName: 'Severe', colour: '#b91c1c', metadata: { rank: 3 } },
      { code: 'MODERATE', displayName: 'Moderate', colour: '#b45309', metadata: { rank: 2 } },
      { code: 'LOW', displayName: 'Low', colour: '#15803d', metadata: { rank: 1 } },
      { code: 'NONE', displayName: 'None', colour: '#4b5563', metadata: { rank: 0 } },
    ],
  },
];
