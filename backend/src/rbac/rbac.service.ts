import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RbacRepository } from './rbac.repository';
import { PermissionsService } from './permissions.service';
import type {
  RbacPermissionGroupDto,
  RbacRoleDetailDto,
  RbacRoleSummaryDto,
  RbacUserAccessDto,
} from './rbac.types';

/**
 * RBAC read API (Milestone 1). Composes the database-driven catalogue, roles and
 * per-user effective permissions. Read-only for now — the editing workspaces
 * (Milestones 2–3) add mutations; enforcement is flipped over in Milestone 4.
 */
@Injectable()
export class RbacService {
  constructor(
    private readonly repo: RbacRepository,
    private readonly permissions: PermissionsService,
  ) {}

  /** The full permission catalogue, bucketed by group in catalogue order. */
  async getPermissionCatalogue(): Promise<RbacPermissionGroupDto[]> {
    const permissions = await this.repo.listPermissions();
    const groups: RbacPermissionGroupDto[] = [];
    const index = new Map<string, RbacPermissionGroupDto>();
    for (const permission of permissions) {
      let bucket = index.get(permission.group);
      if (!bucket) {
        bucket = { group: permission.group, permissions: [] };
        index.set(permission.group, bucket);
        groups.push(bucket);
      }
      bucket.permissions.push(permission);
    }
    return groups;
  }

  listRoles(): Promise<RbacRoleSummaryDto[]> {
    return this.repo.listRoles();
  }

  async getRole(idOrKey: string): Promise<RbacRoleDetailDto> {
    const role = await this.repo.findRole(idOrKey);
    if (!role) throw new NotFoundException('Role not found.');
    return role;
  }

  async getUserAccess(userId: string): Promise<RbacUserAccessDto> {
    const access = await this.repo.findUserAccess(userId);
    if (!access) throw new NotFoundException('User not found.');
    return access;
  }

  // ── Role writes (Milestone 3) ───────────────────────────────────────────────

  async createRole(input: {
    name: string;
    description?: string;
    color?: string;
    permissionKeys?: string[];
  }): Promise<RbacRoleDetailDto> {
    try {
      return await this.repo.createRole({
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
        permissionKeys: input.permissionKeys ?? [],
      });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  async updateRole(
    idOrKey: string,
    patch: { name?: string; description?: string; color?: string; isActive?: boolean },
  ): Promise<RbacRoleDetailDto> {
    let role: RbacRoleDetailDto | null;
    try {
      role = await this.repo.updateRole(idOrKey, patch);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (!role) throw new NotFoundException('Role not found.');
    return role;
  }

  async setRolePermissions(idOrKey: string, permissionKeys: string[]): Promise<RbacRoleDetailDto> {
    let role: RbacRoleDetailDto | null;
    try {
      role = await this.repo.setRolePermissions(idOrKey, permissionKeys);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (!role) throw new NotFoundException('Role not found.');
    // A role's grants changed → every holder's effective set may change.
    this.permissions.invalidate();
    return role;
  }

  /** Assign roles to a user, returning the refreshed access view. */
  async setUserRoles(userId: string, roleKeys: string[]): Promise<RbacUserAccessDto> {
    let ok: boolean;
    try {
      ok = await this.repo.setUserRoles(userId, roleKeys);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (!ok) throw new NotFoundException('User not found.');
    this.permissions.invalidate();
    return this.getUserAccess(userId);
  }

  /**
   * Replace a user's per-user permission overrides, returning the refreshed access
   * view (with recomputed effective permissions). An empty list resets the user to
   * role defaults. `actorUsername` is recorded as `created_by`.
   */
  async setUserOverrides(
    userId: string,
    overrides: { permissionKey: string; grant: boolean }[],
    actorUsername?: string | null,
  ): Promise<RbacUserAccessDto> {
    const clean = (overrides ?? [])
      .map((o) => ({ permissionKey: String(o?.permissionKey ?? '').trim(), grant: Boolean(o?.grant) }))
      .filter((o) => o.permissionKey.length > 0);
    let ok: boolean;
    try {
      ok = await this.repo.setUserOverrides(userId, clean, actorUsername);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (!ok) throw new NotFoundException('User not found.');
    this.permissions.invalidate();
    return this.getUserAccess(userId);
  }
}
