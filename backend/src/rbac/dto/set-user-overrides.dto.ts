import { IsArray } from 'class-validator';

/**
 * Replace a user's per-user permission overrides (enterprise RBAC enhancement).
 * Each entry is `{ permissionKey, grant }`: `grant: true` force-allows, `false`
 * force-denies. Omitting a permission removes its override (role inheritance);
 * an empty array resets the user to role defaults. Element shape is sanitised in
 * the service, so no nested class-transformer dependency is required.
 */
export class SetUserOverridesDto {
  @IsArray()
  overrides!: Array<{ permissionKey: string; grant: boolean }>;
}
