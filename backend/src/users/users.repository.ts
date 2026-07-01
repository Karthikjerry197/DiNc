import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { UserRecord } from './user.types';

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

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
      `UPDATE public.users SET password_hash = $1 WHERE username = $2`,
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
}
