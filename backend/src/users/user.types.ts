export interface UserRecord {
  username: string;
  password_hash: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

/**
 * Legacy hardcoded role list — BACKWARD-COMPATIBILITY ONLY.
 *
 * TECH DEBT (to be eliminated during the RBAC Readiness Audit / enforcement flip,
 * Milestone 4): this constant, together with the legacy `users.role` column, is
 * the only remaining hardcoded business configuration in the Users module. It
 * merely guards `@IsIn` validation on the legacy `role` field of create/update
 * and backs `GET /api/users/roles`. Roles shown and assigned in the User
 * Workspace already come from the RBAC database (`rbac_roles` → `rbac_user_roles`);
 * this array does NOT drive the workspace. Left unchanged in Milestone 3A on
 * purpose — do not extend or rely on it. It will be replaced by the RBAC roles
 * table as the single source of truth in Milestone 4.
 */
export const ASSIGNABLE_ROLES = ['ADMIN', 'CLINICIAN', 'ANM', 'CARE_ASSISTANT'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** One user as listed on Administration → Users & Roles. Never includes the hash. */
export interface AdminUserDto {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  facility: string | null;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}
