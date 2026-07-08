/**
 * RBAC foundation types (Milestone 1).
 *
 * The normalized RBAC schema is additive and does NOT replace the existing
 * hardcoded permission enforcement (frontend lib/permissions.ts + backend
 * auth/permissions.ts) yet — that flip happens in Milestone 4. Here we only
 * build the database-driven source of truth and expose read APIs, seeded to
 * mirror today's behaviour exactly so nothing changes for end users.
 */

// ── API DTOs ─────────────────────────────────────────────────────────────────

export interface RbacPermissionDto {
  id: string;
  key: string;
  group: string;
  label: string;
  description: string | null;
  sortOrder: number;
  /** Keys of permissions this one requires (prerequisites) — dependency config. */
  requires: string[];
}

/** Permissions bucketed by their group (Navigation, Workflow, …) for the UI. */
export interface RbacPermissionGroupDto {
  group: string;
  permissions: RbacPermissionDto[];
}

export interface RbacRoleSummaryDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissionCount: number;
  userCount: number;
  createdAt: string;
}

export interface RbacRoleDetailDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  isActive: boolean;
  /** Keys of every permission granted to this role. */
  permissionKeys: string[];
  createdAt: string;
}

export interface RbacUserRoleDto {
  id: string;
  key: string;
  name: string;
  color: string | null;
  isPrimary: boolean;
}

/** A user's assigned roles plus the union of their effective permissions. */
export interface RbacUserAccessDto {
  userId: string;
  username: string;
  fullName: string;
  roles: RbacUserRoleDto[];
  effectivePermissions: string[];
}

// ── Seed catalogue (mirrors frontend lib/permissions.ts, the current impl) ─────

/** Canonical permission groups used to organise the catalogue in the UI. */
export const RBAC_GROUPS = {
  NAVIGATION: 'Navigation',
  WORKFLOW: 'Workflow',
  PROGRAMMES: 'Programmes',
  FEATURE: 'Feature Visibility',
  REPORTS: 'Reports',
  ADMINISTRATION: 'Administration',
} as const;

export interface SeedPermission {
  key: string;
  group: string;
  label: string;
  description: string;
}

export interface SeedRole {
  key: string;
  name: string;
  description: string;
  color: string;
  permissions: string[];
}

/**
 * Every permission the application currently recognises, grouped. Keys are the
 * exact strings the app already checks via `can(...)`, so seeding these makes the
 * database a faithful mirror of the hardcoded registry.
 */
export const RBAC_SEED_PERMISSIONS: SeedPermission[] = [
  { key: 'worklist.view', group: RBAC_GROUPS.NAVIGATION, label: 'View Worklist', description: 'Access the Worklist module.' },
  { key: 'citizens.view', group: RBAC_GROUPS.NAVIGATION, label: 'View Citizens', description: 'Access the Citizens registry and workspace.' },
  { key: 'worklist.view.all', group: RBAC_GROUPS.WORKFLOW, label: 'View All Worklist Items', description: 'See every worklist item regardless of assignee (otherwise only own).' },
  { key: 'dashboard.view.all', group: RBAC_GROUPS.WORKFLOW, label: 'View All Dashboard Activity', description: 'See dashboard activity across all workers (otherwise only own).' },
  { key: 'dashboard.edit', group: RBAC_GROUPS.FEATURE, label: 'Edit Dashboard Layout', description: 'Customise and save the dashboard layout.' },
  { key: 'reports.view', group: RBAC_GROUPS.REPORTS, label: 'View Reports', description: 'Access the Reports & Analytics module.' },
  { key: 'reports.admin', group: RBAC_GROUPS.REPORTS, label: 'Manage Reports', description: 'Administer report configuration.' },
  { key: 'admin.pages', group: RBAC_GROUPS.ADMINISTRATION, label: 'Access Administration', description: 'Open the Administration area (Users & Roles, settings).' },
  { key: 'admin.data-quality', group: RBAC_GROUPS.ADMINISTRATION, label: 'Data Quality Tools', description: 'Access the Data Quality administration tools.' },
  { key: 'admin.workflow', group: RBAC_GROUPS.ADMINISTRATION, label: 'Workflow Configuration', description: 'Configure the Workflow Rules engine.' },
  { key: 'admin.scheduler', group: RBAC_GROUPS.ADMINISTRATION, label: 'Scheduler Configuration', description: 'Configure scheduled jobs and reminders.' },
];

/**
 * Permission prerequisites (dependency configuration, Milestone 3). "key requires
 * requires" means a role granting `key` must also grant `requires`. Seeded once;
 * thereafter this lives in `rbac_permission_dependencies` and is admin-owned
 * business configuration — the app never hardcodes it at runtime.
 */
export interface SeedDependency {
  key: string;
  requires: string;
}

export const RBAC_SEED_DEPENDENCIES: SeedDependency[] = [
  { key: 'worklist.view.all', requires: 'worklist.view' },
  { key: 'reports.admin', requires: 'reports.view' },
  { key: 'admin.data-quality', requires: 'admin.pages' },
  { key: 'admin.workflow', requires: 'admin.pages' },
  { key: 'admin.scheduler', requires: 'admin.pages' },
];

/** The four assignable roles and their grants — identical to lib/permissions.ts. */
export const RBAC_SEED_ROLES: SeedRole[] = [
  {
    key: 'ADMIN',
    name: 'Administrator',
    description: 'Full platform access, including administration and configuration.',
    color: '#ef4444',
    permissions: [
      'worklist.view', 'worklist.view.all', 'dashboard.view.all', 'citizens.view',
      'reports.view', 'reports.admin', 'admin.pages', 'admin.data-quality',
      'admin.workflow', 'admin.scheduler', 'dashboard.edit',
    ],
  },
  {
    key: 'CLINICIAN',
    name: 'Clinical Staff',
    description: 'Clinical worklist, citizen care, and reports.',
    color: '#2563eb',
    permissions: ['worklist.view', 'citizens.view', 'reports.view'],
  },
  {
    key: 'ANM',
    name: 'ANM',
    description: 'Auxiliary Nurse Midwife — worklist, citizen care, and reports.',
    color: '#16a34a',
    permissions: ['worklist.view', 'citizens.view', 'reports.view'],
  },
  {
    key: 'CARE_ASSISTANT',
    name: 'Care Assistant',
    description: 'Frontline care worklist and citizen access.',
    color: '#a855f7',
    permissions: ['worklist.view', 'citizens.view'],
  },
];
