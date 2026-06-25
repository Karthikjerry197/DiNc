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
}
