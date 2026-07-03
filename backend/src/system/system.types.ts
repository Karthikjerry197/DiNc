/**
 * System Settings read-model. An administrator-facing, read-only view that
 * surfaces configuration already present in the system (env / config / build) —
 * it introduces NO new storage and NO new settings. Implementation details
 * (secrets, algorithms, hosts, ports, runtime internals) are deliberately never
 * included; only information meaningful to an administrator is exposed.
 */

/** Password minimum length — mirrors the value enforced by the user/auth DTOs. */
export const PASSWORD_MIN_LENGTH = 8;

export interface SystemSettingsDto {
  /** Deploying organization. Editable client-side; these are the defaults. */
  organization: {
    name: string;
    facility: string | null;
    district: string | null;
    contactEmail: string | null;
  };
  /** Read-only application identity. */
  application: {
    name: string;
    version: string;
    environment: string;
  };
  /** Read-only, administrator-meaningful security posture (no secrets/internals). */
  security: {
    /** Configured sign-in session lifetime, e.g. "8h". */
    sessionLifetime: string;
    passwordMinLength: number;
  };
}
