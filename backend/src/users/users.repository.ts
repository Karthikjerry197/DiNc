import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AdminUserDto, UserRecord } from './user.types';

interface AdminUserRow {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  facility: string | null;
  role: string;
  is_active: boolean;
  last_login: Date | null;
  created_at: Date;
}

/**
 * DiNc migration Step 1 (docs/MIGRATION_ANALYSIS_v1.md §3a, D1):
 * identity/profile lives in dinc_security.app_user; credentials live in the
 * separate dinc_security.user_credential table (1:1 via user_id).
 *
 * TODO(Step 2+): email/phone/department/designation/facility have no columns
 * on app_user yet — they are surfaced as NULL and not persisted. Revisit when
 * the profile-fields decision is implemented (see analysis doc §4 row 2).
 */
const ADMIN_USER_COLUMNS = `
  u.user_id AS id,
  u.username,
  u.full_name,
  NULL::text AS email,
  NULL::text AS phone,
  NULL::text AS department,
  NULL::text AS designation,
  NULL::text AS facility,
  u.role,
  u.is_active,
  c.last_login_at AS last_login,
  u.created_at`;

const ADMIN_USER_FROM = `
  FROM dinc_security.app_user u
  LEFT JOIN dinc_security.user_credential c ON c.user_id = u.user_id`;

@Injectable()
export class UsersRepository implements OnModuleInit {
  private readonly logger = new Logger(UsersRepository.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Idempotent safety net for the Step 0+1 provisioning normally applied by
   * scripts/dinc_step1_foundation.sql — keeps boot self-healing, following the
   * codebase's additive provisioning convention. Never touches dinc_metadata.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.db.query(
        `CREATE TABLE IF NOT EXISTS dinc_security.user_credential (
           credential_id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
           user_id             uuid        NOT NULL UNIQUE REFERENCES dinc_security.app_user(user_id),
           password_hash       text        NOT NULL,
           password_algorithm  text        NOT NULL DEFAULT 'bcrypt',
           password_changed_at timestamptz,
           failed_login_count  integer     NOT NULL DEFAULT 0,
           locked_until        timestamptz,
           last_login_at       timestamptz,
           is_active           boolean     NOT NULL DEFAULT true,
           created_at          timestamptz NOT NULL DEFAULT now(),
           updated_at          timestamptz NOT NULL DEFAULT now()
         )`,
      );
    } catch (error) {
      this.logger.error(`user_credential provisioning failed: ${(error as Error).message}`);
    }
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const result = await this.db.query<UserRecord>(
      `SELECT u.username,
              COALESCE(c.password_hash, '') AS password_hash,
              u.full_name,
              u.role,
              (u.is_active AND COALESCE(c.is_active, true)
               AND (c.locked_until IS NULL OR c.locked_until < now())) AS is_active
       FROM dinc_security.app_user u
       LEFT JOIN dinc_security.user_credential c ON c.user_id = u.user_id
       WHERE u.username = $1
       LIMIT 1`,
      [username],
    );
    return result.rows[0] ?? null;
  }

  async updatePassword(username: string, newPasswordHash: string): Promise<void> {
    await this.db.query(
      `INSERT INTO dinc_security.user_credential (user_id, password_hash, password_changed_at)
       SELECT u.user_id, $1, now() FROM dinc_security.app_user u WHERE u.username = $2
       ON CONFLICT (user_id) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             password_changed_at = now(),
             updated_at = now()`,
      [newPasswordHash, username],
    );
  }

  async findAllActive(): Promise<{ username: string; full_name: string; role: string }[]> {
    const result = await this.db.query<{ username: string; full_name: string; role: string }>(
      `SELECT username, full_name, role
       FROM dinc_security.app_user
       WHERE is_active = true
       ORDER BY role, username`,
    );
    return result.rows;
  }

  async recordLogin(username: string): Promise<void> {
    await this.db.query(
      `UPDATE dinc_security.user_credential c
         SET last_login_at = now(), failed_login_count = 0, updated_at = now()
       FROM dinc_security.app_user u
       WHERE u.user_id = c.user_id AND u.username = $1`,
      [username],
    );
  }

  // ── Users & Roles administration ────────────────────────────────────────────

  async listAll(): Promise<AdminUserDto[]> {
    const result = await this.db.query<AdminUserRow>(
      `SELECT ${ADMIN_USER_COLUMNS} ${ADMIN_USER_FROM}
       ORDER BY u.created_at, u.username`,
    );
    return result.rows.map(UsersRepository.toDto);
  }

  async findAdminUserById(id: string): Promise<AdminUserDto | null> {
    const result = await this.db.query<AdminUserRow>(
      `SELECT ${ADMIN_USER_COLUMNS} ${ADMIN_USER_FROM} WHERE u.user_id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ? UsersRepository.toDto(result.rows[0]) : null;
  }

  async usernameExists(username: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM dinc_security.app_user WHERE lower(username) = lower($1)
       ) AS exists`,
      [username],
    );
    return result.rows[0]?.exists ?? false;
  }

  async insertUser(input: {
    username: string;
    passwordHash: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    department: string | null;
    designation: string | null;
    facility: string | null;
    role: string;
  }): Promise<AdminUserDto> {
    // TODO(Step 2+): email/phone/department/designation/facility are accepted
    // by the API but not persisted — app_user has no such columns yet.
    return this.db.withTransaction(async (tx) => {
      const user = await tx.query<AdminUserRow>(
        `INSERT INTO dinc_security.app_user (username, full_name, role, is_active)
         VALUES ($1, $2, $3, true)
         RETURNING user_id AS id, username, full_name,
                   NULL::text AS email, NULL::text AS phone, NULL::text AS department,
                   NULL::text AS designation, NULL::text AS facility,
                   role, is_active, NULL::timestamptz AS last_login, created_at`,
        [input.username, input.fullName, input.role],
      );
      await tx.query(
        `INSERT INTO dinc_security.user_credential (user_id, password_hash, password_changed_at)
         VALUES ($1, $2, now())`,
        [user.rows[0].id, input.passwordHash],
      );
      return UsersRepository.toDto(user.rows[0]);
    });
  }

  async updateUser(
    id: string,
    input: {
      fullName: string;
      email: string | null;
      phone: string | null;
      department: string | null;
      designation: string | null;
      facility: string | null;
      role: string;
      isActive: boolean;
    },
  ): Promise<AdminUserDto | null> {
    // TODO(Step 2+): profile fields not persisted (no app_user columns yet).
    const result = await this.db.query<AdminUserRow>(
      `UPDATE dinc_security.app_user u
       SET full_name = $2, role = $3, is_active = $4
       WHERE u.user_id = $1
       RETURNING u.user_id AS id, u.username, u.full_name,
                 NULL::text AS email, NULL::text AS phone, NULL::text AS department,
                 NULL::text AS designation, NULL::text AS facility,
                 u.role, u.is_active, NULL::timestamptz AS last_login, u.created_at`,
      [id, input.fullName, input.role, input.isActive],
    );
    return result.rows[0] ? UsersRepository.toDto(result.rows[0]) : null;
  }

  async updatePasswordById(id: string, newPasswordHash: string): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO dinc_security.user_credential (user_id, password_hash, password_changed_at)
       SELECT u.user_id, $2, now() FROM dinc_security.app_user u WHERE u.user_id = $1
       ON CONFLICT (user_id) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             password_changed_at = now(),
             updated_at = now()`,
      [id, newPasswordHash],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Active ADMIN accounts other than the given user id (last-admin protection). */
  async countOtherActiveAdmins(excludeId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT count(*) AS count
       FROM dinc_security.app_user
       WHERE role = 'ADMIN' AND is_active = true AND user_id <> $1`,
      [excludeId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  private static toDto(row: AdminUserRow): AdminUserDto {
    return {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      department: row.department,
      designation: row.designation,
      facility: row.facility,
      role: row.role,
      isActive: row.is_active,
      lastLogin: row.last_login ? row.last_login.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    };
  }
}