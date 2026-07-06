/**
 * Central role-permission registry.
 *
 * To grant a capability to a role: add its permission string to that role's set.
 * To protect a UI element or route: call can(role, 'some.permission').
 * To add a new module's permissions: add strings here — no other file changes.
 */

const ROLE_PERMISSIONS: Record<string, ReadonlySet<string>> = {
  ADMIN: new Set([
    'worklist.view',
    // Sees every worklist item / dashboard activity regardless of assignee
    // (mirrored in backend auth/permissions.ts, where the scoping happens).
    'worklist.view.all',
    'dashboard.view.all',
    'citizens.view',
    'reports.view',
    'reports.admin',
    'admin.pages',
    'admin.data-quality',
    'admin.workflow',
    'admin.scheduler',
    'dashboard.edit',
  ]),
  CLINICIAN: new Set([
    'worklist.view',
    'citizens.view',
    'reports.view',
  ]),
  ANM: new Set([
    'worklist.view',
    'citizens.view',
    'reports.view',
  ]),
  CARE_ASSISTANT: new Set([
    'worklist.view',
    'citizens.view',
  ]),
  Guest: new Set(),
};

/** Returns true when the given role holds the given permission. */
export function can(role: string, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
