export interface UserRecord {
  username: string;
  password_hash: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

/** Roles assignable through the Users & Roles administration page. */
export const ASSIGNABLE_ROLES = ['ADMIN', 'CLINICIAN', 'ANM', 'CARE_ASSISTANT'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** One user as listed on Administration → Users & Roles. Never includes the hash. */
export interface AdminUserDto {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}
