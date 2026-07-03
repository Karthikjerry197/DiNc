import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';
import { AdminUserDto } from './user.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 10;

/**
 * Users & Roles administration. Guardrails: an administrator can never disable
 * their own account, and the system always keeps at least one active ADMIN —
 * both protections prevent locking everyone out of Administration.
 */
@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}

  listUsers(): Promise<AdminUserDto[]> {
    return this.repo.listAll();
  }

  async createUser(input: CreateUserDto): Promise<AdminUserDto> {
    const username = input.username.trim().toLowerCase();
    if (await this.repo.usernameExists(username)) {
      throw new ConflictException(`Username '${username}' is already taken.`);
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    return this.repo.insertUser({
      username,
      passwordHash,
      fullName: input.fullName.trim(),
      email: input.email?.trim() || null,
      role: input.role,
    });
  }

  async updateUser(
    id: string,
    input: UpdateUserDto,
    actingUsername: string,
  ): Promise<AdminUserDto> {
    const existing = await this.requireUser(id);

    const nextRole = input.role ?? existing.role;
    const nextActive = input.isActive ?? existing.isActive;
    const losesAdmin =
      existing.role === 'ADMIN' && existing.isActive && (nextRole !== 'ADMIN' || !nextActive);

    if (input.isActive === false && existing.username === actingUsername) {
      throw new BadRequestException('You cannot disable your own account.');
    }
    if (losesAdmin && (await this.repo.countOtherActiveAdmins(id)) === 0) {
      throw new BadRequestException(
        'At least one active administrator account must remain.',
      );
    }

    const updated = await this.repo.updateUser(id, {
      fullName: (input.fullName ?? existing.fullName).trim(),
      email: input.email !== undefined ? input.email?.trim() || null : existing.email,
      role: nextRole,
      isActive: nextActive,
    });
    if (!updated) throw new NotFoundException('User not found.');
    return updated;
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    await this.requireUser(id);
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.repo.updatePasswordById(id, hash);
  }

  private async requireUser(id: string): Promise<AdminUserDto> {
    const user = await this.repo.findAdminUserById(id);
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }
}
