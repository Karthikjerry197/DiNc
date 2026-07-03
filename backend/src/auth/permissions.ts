/**
 * Central role-permission registry (backend twin of frontend lib/permissions.ts).
 *
 * Visibility and capability checks are keyed by permission STRINGS, not roles,
 * so behaviour can later be driven by configurable permissions without touching
 * call sites. To grant a capability to a role: add the permission string to that
 * role's set here — no other file changes.
 */

const ROLE_PERMISSIONS: Record<string, ReadonlySet<string>> = {
  ADMIN: new Set([
    // Sees every worklist item / dashboard activity regardless of assignee;
    // roles without these permissions see only items assigned to themselves.
    'worklist.view.all',
    'dashboard.view.all',
  ]),
  CLINICIAN: new Set([]),
  ANM: new Set([]),
  CARE_ASSISTANT: new Set([]),
};

/** Returns true when the given role holds the given permission. */
export function hasPermission(
  role: string | null | undefined,
  permission: string,
): boolean {
  return ROLE_PERMISSIONS[(role ?? '').toUpperCase()]?.has(permission) ?? false;
}
