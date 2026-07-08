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

const ADMIN_USER_COLUMNS = `id, username, full_name, email, phone, department, designation, facility, role, is_active, last_login, created_at`;

@Injectable()
export class UsersRepository implements OnModuleInit {
  private readonly logger = new Logger(UsersRepository.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Additive columns for Users & Roles administration. `last_login` is recorded
   * on each login; phone/department/designation/facility are intrinsic user
   * profile fields edited in the User Workspace (Milestone 3A). All are plain,
   * nullable columns on the existing users master table — never a duplicate
   * profile table — following the additive `ADD COLUMN IF NOT EXISTS` convention.
   *
   * `phone` is inherently free-text. `department`, `designation` and `facility`
   * are free-text user attributes today (per Milestone 3A scope). Future
   * scalability note: `facility` is the strongest candidate to become an
   * administrator-configurable PostgreSQL lookup/reference (it likely maps to the
   * facility / geographic hierarchy); `designation` and `department` are plausible
   * configurable reference lists too. Migrating them would be additive (add a
   * nullable FK alongside, backfill, switch the UI to a DB-driven dropdown) and is
   * intentionally NOT implemented here.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.db.query(
        `ALTER TABLE public.users
           ADD COLUMN IF NOT EXISTS last_login  timestamptz,
           ADD COLUMN IF NOT EXISTS phone       varchar(30),
           ADD COLUMN IF NOT EXISTS department  varchar(120),
           ADD COLUMN IF NOT EXISTS designation varchar(120),
           ADD COLUMN IF NOT EXISTS facility    varchar(160)`,
      );
    } catch (error) {
      this.logger.error(`users profile column provisioning failed: ${(error as Error).message}`);
    }
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const result = await this.db.query<UserRecord>(
      `SELECT username, password_hash, full_name, role, is_active
       FROM public.users
       WHERE username = $1
       LIMIT 1`,
      [username],
    );
    return result.rows[0] ?? null;
  }

  async updatePassword(username: string, newPasswordHash: string): Promise<void> {
    await this.db.query(
      `UPDATE public.users SET password_hash = $1, updated_at = now() WHERE username = $2`,
      [newPasswordHash, username],
    );
  }

  async findAllActive(): Promise<{ username: string; full_name: string; role: string }[]> {
    const result = await this.db.query<{ username: string; full_name: string; role: string }>(
      `SELECT username, full_name, role
       FROM public.users
       WHERE is_active = true
       ORDER BY role, username`,
    );
    return result.rows;
  }

  async recordLogin(username: string): Promise<void> {
    await this.db.query(
      `UPDATE public.users SET last_login = now() WHERE username = $1`,
      [username],
    );
  }

  // ── Users & Roles administration ────────────────────────────────────────────

  async listAll(): Promise<AdminUserDto[]> {
    const result = await this.db.query<AdminUserRow>(
      `SELECT ${ADMIN_USER_COLUMNS}
       FROM public.users
       ORDER BY created_at, username`,
    );
    return result.rows.map(UsersRepository.toDto);
  }

  async findAdminUserById(id: string): Promise<AdminUserDto | null> {
    const result = await this.db.query<AdminUserRow>(
      `SELECT ${ADMIN_USER_COLUMNS} FROM public.users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ? UsersRepository.toDto(result.rows[0]) : null;
  }

  async usernameExists(username: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.users WHERE lower(username) = lower($1)) AS exists`,
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
    const result = await this.db.query<AdminUserRow>(
      `INSERT INTO public.users
         (username, password_hash, full_name, email, phone, department, designation, facility, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       RETURNING ${ADMIN_USER_COLUMNS}`,
      [
        input.username, input.passwordHash, input.fullName, input.email,
        input.phone, input.department, input.designation, input.facility, input.role,
      ],
    );
    return UsersRepository.toDto(result.rows[0]);
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
    const result = await this.db.query<AdminUserRow>(
      `UPDATE public.users
       SET full_name = $2, email = $3, phone = $4, department = $5, designation = $6,
           facility = $7, role = $8, is_active = $9, updated_at = now()
       WHERE id = $1
       RETURNING ${ADMIN_USER_COLUMNS}`,
      [
        id, input.fullName, input.email, input.phone, input.department,
        input.designation, input.facility, input.role, input.isActive,
      ],
    );
    return result.rows[0] ? UsersRepository.toDto(result.rows[0]) : null;
  }

  async updatePasswordById(id: string, newPasswordHash: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE public.users SET password_hash = $2, updated_at = now() WHERE id = $1`,
      [id, newPasswordHash],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Active ADMIN accounts other than the given user id (last-admin protection). */
  async countOtherActiveAdmins(excludeId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT count(*) AS count
       FROM public.users
       WHERE role = 'ADMIN' AND is_active = true AND id <> $1`,
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
