export interface UserRecord {
  username: string;
  password_hash: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

// M40 Configuration Convergence: the legacy hardcoded `ASSIGNABLE_ROLES` array
// was retired. `rbac_roles` is now the single source of truth for roles — the
// `GET /api/users/roles` endpoint and create/update role validation both resolve
// against it via RbacRepository (see UsersService).

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
