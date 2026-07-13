import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';
import { RbacRepository } from '../rbac/rbac.repository';
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
  // RbacRepository is provided by the @Global RbacModule (no import needed).
  constructor(
    private readonly repo: UsersRepository,
    private readonly rbacRepo: RbacRepository,
  ) {}

  listUsers(): Promise<AdminUserDto[]> {
    return this.repo.listAll();
  }

  /**
   * The assignable role vocabulary — resolved from the `rbac_roles` single source
   * of truth (M40 Configuration Convergence). Backs `GET /api/users/roles`.
   */
  async listAssignableRoles(): Promise<string[]> {
    const roles = await this.rbacRepo.listRoles();
    return roles.map((r) => r.key);
  }

  /** Rejects a role that is not a defined RBAC role. */
  private async assertValidRole(role: string): Promise<void> {
    const keys = await this.listAssignableRoles();
    if (!keys.includes(role)) {
      throw new BadRequestException(`Role must be one of: ${keys.join(', ')}.`);
    }
  }

  async createUser(input: CreateUserDto): Promise<AdminUserDto> {
    const username = input.username.trim().toLowerCase();
    if (await this.repo.usernameExists(username)) {
      throw new ConflictException(`Username '${username}' is already taken.`);
    }
    await this.assertValidRole(input.role);
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    return this.repo.insertUser({
      username,
      passwordHash,
      fullName: input.fullName.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      department: input.department?.trim() || null,
      designation: input.designation?.trim() || null,
      facility: input.facility?.trim() || null,
      role: input.role,
    });
  }

  /**
   * Partial-update helper: an omitted field (undefined) keeps its current value;
   * a provided field is trimmed and empty strings collapse to null. Keeps the
   * User Workspace's profile edits truly additive per field.
   */
  private static patch(next: string | null | undefined, current: string | null): string | null {
    if (next === undefined) return current;
    return next?.trim() || null;
  }

  async updateUser(
    id: string,
    input: UpdateUserDto,
    actingUsername: string,
  ): Promise<AdminUserDto> {
    const existing = await this.requireUser(id);

    if (input.role !== undefined) await this.assertValidRole(input.role);

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
      phone: UsersService.patch(input.phone, existing.phone),
      department: UsersService.patch(input.department, existing.department),
      designation: UsersService.patch(input.designation, existing.designation),
      facility: UsersService.patch(input.facility, existing.facility),
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
