import { Injectable, UnauthorizedException } from '@nestjs/common';
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

    return {
      token: await this.jwt.signAsync(payload),
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    };
  }
}
