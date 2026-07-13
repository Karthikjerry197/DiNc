import { Injectable, Logger } from '@nestjs/common';
import { RbacRepository } from './rbac.repository';
import { RBAC_SEED_ROLES } from './rbac.types';

/** Minimal identity extracted from the JWT (sub = username, plus role). */
export interface RequestUser {
  sub?: string;
  username?: string;
  role?: string;
}

/**
 * Single source of truth for runtime authorization (Milestone 4 — the enforcement
 * flip). Resolves a user's EFFECTIVE permission set — role grants ∪ user grants \
 * user denies — live from the RBAC tables, so administrator edits in the Role /
 * User workspaces take effect immediately (bounded only by a short cache TTL,
 * which is also cleared on every RBAC write).
 *
 * Safety fallback: when a user has NO RBAC role assignment at all (e.g. an old
 * account created before the RBAC bootstrap, or a database that never seeded),
 * the legacy per-role registry (RBAC_SEED_ROLES, identical to the pre-flip
 * hardcoded maps) is used so a misconfigured deployment can never lock everyone
 * out. A user who IS mapped is governed purely by the database, even if that
 * yields an empty set.
 */
@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  private readonly cache = new Map<string, { perms: Set<string>; expiresAt: number }>();
  private static readonly TTL_MS = 10_000;

  constructor(private readonly repo: RbacRepository) {}

  /** The caller's effective permissions, cached briefly per username. */
  async getEffectivePermissions(user: RequestUser | null | undefined): Promise<Set<string>> {
    const username = (user?.username ?? user?.sub ?? '').trim();
    if (!username) return new Set();

    const cached = this.cache.get(username);
    if (cached && cached.expiresAt > Date.now()) return cached.perms;

    let keys: string[] | null = null;
    try {
      keys = await this.repo.findEffectivePermissionKeysByUsername(username);
    } catch (error) {
      this.logger.warn(
        `Effective-permission lookup failed for '${username}', using legacy fallback: ${(error as Error).message}`,
      );
      keys = null;
    }

    const perms = keys ? new Set(keys) : PermissionsService.legacyFallback(user?.role);
    this.cache.set(username, { perms, expiresAt: Date.now() + PermissionsService.TTL_MS });
    return perms;
  }

  /** True when the caller holds every one of the given permission keys. */
  async hasAll(user: RequestUser | null | undefined, keys: string[]): Promise<boolean> {
    if (keys.length === 0) return true;
    const perms = await this.getEffectivePermissions(user);
    return keys.every((k) => perms.has(k));
  }

  /** True when the caller holds the given permission key. */
  async has(user: RequestUser | null | undefined, key: string): Promise<boolean> {
    return (await this.getEffectivePermissions(user)).has(key);
  }

  /**
   * Drop cached permissions. Called after any RBAC mutation (role grants, user
   * roles, user overrides) so changes are visible on the very next request.
   */
  invalidate(username?: string): void {
    if (username) this.cache.delete(username);
    else this.cache.clear();
  }

  /** Legacy role → permissions map, used only when a user has no RBAC mapping. */
  private static legacyFallback(role: string | undefined): Set<string> {
    const key = (role ?? '').toUpperCase();
    const seeded = RBAC_SEED_ROLES.find((r) => r.key === key);
    return new Set(seeded?.permissions ?? []);
  }
}
