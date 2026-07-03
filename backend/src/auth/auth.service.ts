import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../users/users.repository';
import { JwtPayload } from './types/jwt-payload.type';

export interface LoginResult {
  token: string;
  username: string;
  full_name: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string): Promise<LoginResult> {
    const user = await this.users.findByUsername(username);

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const payload: JwtPayload = {
      sub: user.username,
      name: user.full_name,
      role: user.role,
    };

    await this.users.recordLogin(user.username);

    return {
      token: await this.jwt.signAsync(payload),
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    };
  }

  async changePassword(
    username: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findByUsername(username);
    if (!user) throw new UnauthorizedException('User not found.');

    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) throw new UnauthorizedException('Current password is incorrect.');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.users.updatePassword(username, hash);
  }

  // ── DEV-only helpers ──────────────────────────────────────────────────────
  // These methods bypass password verification and must only be exposed via
  // routes that are clearly marked as development-only. Remove or gate behind
  // an environment flag before deploying to production.

  async devListUsers(): Promise<{ username: string; full_name: string; role: string }[]> {
    return this.users.findAllActive();
  }

  async devSwitchUser(targetUsername: string): Promise<LoginResult> {
    const user = await this.users.findByUsername(targetUsername);
    if (!user || !user.is_active) {
      throw new NotFoundException(`User '${targetUsername}' not found or inactive.`);
    }
    const payload: JwtPayload = {
      sub: user.username,
      name: user.full_name,
      role: user.role,
    };
    return {
      token: await this.jwt.signAsync(payload),
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    };
  }
}
