import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  RBAC_SEED_DEPENDENCIES,
  RBAC_SEED_PERMISSIONS,
  RBAC_SEED_ROLES,
  type RbacPermissionDto,
  type RbacRoleDetailDto,
  type RbacRoleSummaryDto,
  type RbacUserAccessDto,
  type RbacUserRoleDto,
} from './rbac.types';

interface PermissionRow {
  id: string;
  key: string;
  permission_group: string;
  label: string;
  description: string | null;
  sort_order: number;
}

interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: Date;
}

const ROLE_COLUMNS = `id, key, name, description, color, is_system, is_active, created_at`;

/**
 * Data-access layer for the normalized RBAC foundation (Milestone 1).
 *
 * On startup it provisions four additive tables (idempotent — safe to run on
 * every boot) and, on the FIRST boot only (empty rbac_roles), bootstraps them
 * from the current permission registry so the database mirrors today's
 * behaviour. The catalogue of permissions/roles is always upserted so new
 * definitions appear on deploy, but per-role grants and user assignments are
 * seeded once so later administrator edits are never overwritten.
 *
 * Nothing here changes existing enforcement: the app keeps using the hardcoded
 * registry until Milestone 4 flips the source of truth.
 */
@Injectable()
export class RbacRepository implements OnModuleInit {
  private readonly logger = new Logger(RbacRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.migrate();
      await this.seed();
    } catch (error) {
      this.logger.error(`RBAC provisioning failed: ${(error as Error).message}`);
    }
  }

  // ── DDL migration (additive, idempotent) ────────────────────────────────────

  private async migrate(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS public.rbac_roles (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        key         TEXT        NOT NULL UNIQUE,
        name        TEXT        NOT NULL,
        description TEXT,
        color       TEXT,
        is_system   BOOLEAN     NOT NULL DEFAULT false,
        is_active   BOOLEAN     NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS public.rbac_permissions (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        key              TEXT        NOT NULL UNIQUE,
        permission_group TEXT        NOT NULL,
        label            TEXT        NOT NULL,
        description      TEXT,
        sort_order       INT         NOT NULL DEFAULT 0,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS public.rbac_role_permissions (
        role_id       UUID NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES public.rbac_permissions(id) ON DELETE CASCADE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (role_id, permission_id)
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS public.rbac_user_roles (
        user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        role_id     UUID NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,
        is_primary  BOOLEAN     NOT NULL DEFAULT true,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, role_id)
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS public.rbac_permission_dependencies (
        permission_id          UUID NOT NULL REFERENCES public.rbac_permissions(id) ON DELETE CASCADE,
        requires_permission_id UUID NOT NULL REFERENCES public.rbac_permissions(id) ON DELETE CASCADE,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (permission_id, requires_permission_id),
        CHECK (permission_id <> requires_permission_id)
      )
    `);

    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_permissions_group
        ON public.rbac_permissions (permission_group, sort_order)
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_user
        ON public.rbac_user_roles (user_id)
    `);
  }

  // ── Seed (catalogue always upserted; grants bootstrapped once) ──────────────

  private async seed(): Promise<void> {
    const before = await this.db.query<{ count: string }>(
      `SELECT count(*) AS count FROM public.rbac_roles`,
    );
    const bootstrap = Number(before.rows[0]?.count ?? 0) === 0;

    // Catalogue — always kept in sync (definitional), never clobbers rows.
    for (let i = 0; i < RBAC_SEED_PERMISSIONS.length; i += 1) {
      const p = RBAC_SEED_PERMISSIONS[i];
      await this.db.query(
        `INSERT INTO public.rbac_permissions (key, permission_group, label, description, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO NOTHING`,
        [p.key, p.group, p.label, p.description, i],
      );
    }
    for (const r of RBAC_SEED_ROLES) {
      await this.db.query(
        `INSERT INTO public.rbac_roles (key, name, description, color, is_system, is_active)
         VALUES ($1, $2, $3, $4, true, true)
         ON CONFLICT (key) DO NOTHING`,
        [r.key, r.name, r.description, r.color],
      );
    }
    // Permission dependencies are definitional catalogue data — always upserted.
    for (const d of RBAC_SEED_DEPENDENCIES) {
      await this.db.query(
        `INSERT INTO public.rbac_permission_dependencies (permission_id, requires_permission_id)
         SELECT p.id, req.id
         FROM public.rbac_permissions p, public.rbac_permissions req
         WHERE p.key = $1 AND req.key = $2
         ON CONFLICT DO NOTHING`,
        [d.key, d.requires],
      );
    }

    if (!bootstrap) return;

    // First boot only: grant per-role permissions and map existing users to
    // their role, so subsequent administrator edits are preserved across boots.
    for (const r of RBAC_SEED_ROLES) {
      for (const permKey of r.permissions) {
        await this.db.query(
          `INSERT INTO public.rbac_role_permissions (role_id, permission_id)
           SELECT ro.id, pe.id
           FROM public.rbac_roles ro, public.rbac_permissions pe
           WHERE ro.key = $1 AND pe.key = $2
           ON CONFLICT DO NOTHING`,
          [r.key, permKey],
        );
      }
    }
    await this.db.query(
      `INSERT INTO public.rbac_user_roles (user_id, role_id, is_primary)
       SELECT u.id, ro.id, true
       FROM public.users u
       JOIN public.rbac_roles ro ON ro.key = upper(u.role)
       ON CONFLICT DO NOTHING`,
    );
    this.logger.log('RBAC bootstrap seed complete (roles, grants, user assignments).');
  }

  // ── Read queries ────────────────────────────────────────────────────────────

  async listPermissions(): Promise<RbacPermissionDto[]> {
    const result = await this.db.query<PermissionRow>(
      `SELECT id, key, permission_group, label, description, sort_order
       FROM public.rbac_permissions
       ORDER BY sort_order, key`,
    );
    const deps = await this.db.query<{ key: string; requires: string }>(
      `SELECT p.key AS key, req.key AS requires
       FROM public.rbac_permission_dependencies d
       JOIN public.rbac_permissions p   ON p.id = d.permission_id
       JOIN public.rbac_permissions req ON req.id = d.requires_permission_id`,
    );
    const requiresByKey = new Map<string, string[]>();
    for (const row of deps.rows) {
      const list = requiresByKey.get(row.key) ?? [];
      list.push(row.requires);
      requiresByKey.set(row.key, list);
    }
    return result.rows.map((row) => ({
      ...RbacRepository.toPermission(row),
      requires: requiresByKey.get(row.key) ?? [],
    }));
  }

  async listRoles(): Promise<RbacRoleSummaryDto[]> {
    const result = await this.db.query<RoleRow & { permission_count: string; user_count: string }>(
      `SELECT ${ROLE_COLUMNS.split(', ').map((c) => `r.${c}`).join(', ')},
              count(DISTINCT rp.permission_id) AS permission_count,
              count(DISTINCT ur.user_id)       AS user_count
       FROM public.rbac_roles r
       LEFT JOIN public.rbac_role_permissions rp ON rp.role_id = r.id
       LEFT JOIN public.rbac_user_roles ur       ON ur.role_id = r.id
       GROUP BY r.id
       ORDER BY r.is_system DESC, r.name`,
    );
    return result.rows.map((row) => ({
      ...RbacRepository.toRoleBase(row),
      permissionCount: Number(row.permission_count ?? 0),
      userCount: Number(row.user_count ?? 0),
    }));
  }

  /** Resolve a role by its UUID id or its key (e.g. 'ADMIN'). */
  async findRole(idOrKey: string): Promise<RbacRoleDetailDto | null> {
    const result = await this.db.query<RoleRow>(
      `SELECT ${ROLE_COLUMNS} FROM public.rbac_roles
       WHERE id::text = $1 OR key = upper($1)
       LIMIT 1`,
      [idOrKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    const perms = await this.db.query<{ key: string }>(
      `SELECT p.key
       FROM public.rbac_role_permissions rp
       JOIN public.rbac_permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = $1
       ORDER BY p.sort_order, p.key`,
      [row.id],
    );
    return {
      ...RbacRepository.toRoleBase(row),
      permissionKeys: perms.rows.map((r) => r.key),
    };
  }

  /** A user's roles + the union of their effective permission keys. */
  async findUserAccess(userId: string): Promise<RbacUserAccessDto | null> {
    const userRes = await this.db.query<{ id: string; username: string; full_name: string }>(
      `SELECT id, username, full_name FROM public.users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const user = userRes.rows[0];
    if (!user) return null;

    const rolesRes = await this.db.query<{
      id: string;
      key: string;
      name: string;
      color: string | null;
      is_primary: boolean;
    }>(
      `SELECT r.id, r.key, r.name, r.color, ur.is_primary
       FROM public.rbac_user_roles ur
       JOIN public.rbac_roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1
       ORDER BY ur.is_primary DESC, r.name`,
      [userId],
    );
    const permsRes = await this.db.query<{ key: string }>(
      `SELECT DISTINCT p.key
       FROM public.rbac_user_roles ur
       JOIN public.rbac_role_permissions rp ON rp.role_id = ur.role_id
       JOIN public.rbac_permissions p       ON p.id = rp.permission_id
       WHERE ur.user_id = $1
       ORDER BY p.key`,
      [userId],
    );

    const roles: RbacUserRoleDto[] = rolesRes.rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      color: r.color,
      isPrimary: r.is_primary,
    }));
    return {
      userId: user.id,
      username: user.username,
      fullName: user.full_name,
      roles,
      effectivePermissions: permsRes.rows.map((r) => r.key),
    };
  }

  // ── Role writes (Milestone 3 — Role Designer) ───────────────────────────────

  /** Create a custom (non-system) role. Key is derived from the name. */
  async createRole(input: {
    name: string;
    description: string | null;
    color: string | null;
    permissionKeys: string[];
  }): Promise<RbacRoleDetailDto> {
    const key = input.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) throw new Error('Role name must contain letters or numbers.');
    const exists = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.rbac_roles WHERE key = $1) AS exists`,
      [key],
    );
    if (exists.rows[0]?.exists) throw new Error(`A role named '${input.name.trim()}' already exists.`);

    const inserted = await this.db.query<{ id: string }>(
      `INSERT INTO public.rbac_roles (key, name, description, color, is_system, is_active)
       VALUES ($1, $2, $3, $4, false, true)
       RETURNING id`,
      [key, input.name.trim(), input.description, input.color],
    );
    await this.replacePermissions(inserted.rows[0].id, key, input.permissionKeys);
    return (await this.findRole(key))!;
  }

  /** Update editable role details. Cannot deactivate the ADMIN system role. */
  async updateRole(
    idOrKey: string,
    patch: { name?: string; description?: string | null; color?: string | null; isActive?: boolean },
  ): Promise<RbacRoleDetailDto | null> {
    const role = await this.resolveRole(idOrKey);
    if (!role) return null;
    if (role.key === 'ADMIN' && patch.isActive === false) {
      throw new Error('The Administrator role cannot be deactivated.');
    }
    const sets: string[] = [];
    const vals: unknown[] = [role.id];
    const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
    if (patch.name !== undefined) add('name', patch.name.trim());
    if (patch.description !== undefined) add('description', patch.description);
    if (patch.color !== undefined) add('color', patch.color);
    if (patch.isActive !== undefined) add('is_active', patch.isActive);
    if (sets.length > 0) {
      await this.db.query(
        `UPDATE public.rbac_roles SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
        vals,
      );
    }
    return this.findRole(role.id);
  }

  /** Replace a role's permission grants, enforcing dependency prerequisites. */
  async setRolePermissions(idOrKey: string, permissionKeys: string[]): Promise<RbacRoleDetailDto | null> {
    const role = await this.resolveRole(idOrKey);
    if (!role) return null;
    if (role.key === 'ADMIN' && !permissionKeys.includes('admin.pages')) {
      throw new Error("The Administrator role must retain 'Access Administration'.");
    }
    await this.replacePermissions(role.id, role.key, permissionKeys);
    return this.findRole(role.id);
  }

  /** Shared grant-replacement: validates keys + dependency closure, then writes. */
  private async replacePermissions(roleId: string, roleKey: string, permissionKeys: string[]): Promise<void> {
    const keys = Array.from(new Set(permissionKeys));
    const rows = await this.db.query<{ id: string; key: string }>(
      `SELECT id, key FROM public.rbac_permissions WHERE key = ANY($1::text[])`,
      [keys],
    );
    const idByKey = new Map(rows.rows.map((r) => [r.key, r.id]));
    const missing = keys.filter((k) => !idByKey.has(k));
    if (missing.length > 0) throw new Error(`Unknown permission(s): ${missing.join(', ')}`);

    // Dependency validation: every granted permission's prerequisites must also
    // be granted (defence-in-depth — the UI already enforces this).
    const deps = await this.db.query<{ key: string; requires: string }>(
      `SELECT p.key AS key, req.key AS requires
       FROM public.rbac_permission_dependencies d
       JOIN public.rbac_permissions p   ON p.id = d.permission_id
       JOIN public.rbac_permissions req ON req.id = d.requires_permission_id
       WHERE p.key = ANY($1::text[])`,
      [keys],
    );
    const granted = new Set(keys);
    for (const row of deps.rows) {
      if (!granted.has(row.requires)) {
        throw new Error(`'${row.key}' requires '${row.requires}' to be granted first.`);
      }
    }

    await this.db.query(`DELETE FROM public.rbac_role_permissions WHERE role_id = $1`, [roleId]);
    for (const key of keys) {
      await this.db.query(
        `INSERT INTO public.rbac_role_permissions (role_id, permission_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, idByKey.get(key)],
      );
    }
  }

  /** Resolve a role's id/key/is_system by UUID id or key. */
  private async resolveRole(idOrKey: string): Promise<{ id: string; key: string; isSystem: boolean } | null> {
    const res = await this.db.query<{ id: string; key: string; is_system: boolean }>(
      `SELECT id, key, is_system FROM public.rbac_roles
       WHERE id::text = $1 OR key = upper($1) LIMIT 1`,
      [idOrKey],
    );
    const row = res.rows[0];
    return row ? { id: row.id, key: row.key, isSystem: row.is_system } : null;
  }

  // ── Writes (Milestone 2) ────────────────────────────────────────────────────

  /**
   * Replace a user's role assignments. The first key becomes the primary role
   * and is mirrored to `users.role`, keeping the current hardcoded enforcement
   * correct (the source-of-truth flip is Milestone 4). Returns false when the
   * user is unknown; throws when a role key is invalid.
   */
  async setUserRoles(userId: string, roleKeys: string[]): Promise<boolean> {
    const userRes = await this.db.query<{ id: string }>(
      `SELECT id FROM public.users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    if (!userRes.rows[0]) return false;

    // Resolve keys → ids, preserving the requested order (index 0 = primary).
    const rolesRes = await this.db.query<{ id: string; key: string }>(
      `SELECT id, key FROM public.rbac_roles WHERE key = ANY($1::text[])`,
      [roleKeys],
    );
    const byKey = new Map(rolesRes.rows.map((r) => [r.key, r.id]));
    const ordered = roleKeys.map((k) => ({ key: k, id: byKey.get(k) }));
    const missing = ordered.filter((r) => !r.id).map((r) => r.key);
    if (missing.length > 0) {
      throw new Error(`Unknown role(s): ${missing.join(', ')}`);
    }

    await this.db.query(`DELETE FROM public.rbac_user_roles WHERE user_id = $1`, [userId]);
    for (let i = 0; i < ordered.length; i += 1) {
      await this.db.query(
        `INSERT INTO public.rbac_user_roles (user_id, role_id, is_primary)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
        [userId, ordered[i].id, i === 0],
      );
    }
    // Mirror the primary role to users.role for back-compatible enforcement.
    await this.db.query(
      `UPDATE public.users SET role = $2, updated_at = now() WHERE id = $1`,
      [userId, roleKeys[0]],
    );
    return true;
  }

  // ── Mappers ─────────────────────────────────────────────────────────────────

  private static toPermission(row: PermissionRow): RbacPermissionDto {
    return {
      id: row.id,
      key: row.key,
      group: row.permission_group,
      label: row.label,
      description: row.description,
      sortOrder: row.sort_order,
      requires: [],
    };
  }

  private static toRoleBase(row: RoleRow): Omit<RbacRoleDetailDto, 'permissionKeys'> {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      color: row.color,
      isSystem: row.is_system,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
    };
  }
}
