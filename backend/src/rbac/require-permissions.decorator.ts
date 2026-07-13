import { SetMetadata } from '@nestjs/common';

/** Reflector metadata key holding the permission keys a route requires. */
export const PERMISSIONS_KEY = 'dinc_required_permissions';

/**
 * Declares the database-driven permission(s) a route (or whole controller)
 * requires. Enforced by {@link PermissionsGuard} against the caller's EFFECTIVE
 * permissions — the union of their RBAC role grants and per-user overrides,
 * resolved live from PostgreSQL. Granting/revoking a permission in the Role or
 * User workspace therefore changes authorization immediately, with no code edit.
 *
 * Multiple keys are AND-combined (the caller must hold every one).
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
