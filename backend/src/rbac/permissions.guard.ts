import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from './require-permissions.decorator';
import { PermissionsService, RequestUser } from './permissions.service';

/**
 * Database-driven authorization guard (Milestone 4). Reads the permission keys
 * declared by {@link RequirePermissions} and checks them against the caller's
 * EFFECTIVE permissions resolved from PostgreSQL. Routes without the decorator
 * are unaffected (returns true), so this composes additively with JwtAuthGuard:
 *
 *   @UseGuards(JwtAuthGuard, PermissionsGuard)
 *
 * Must run AFTER JwtAuthGuard (which populates `request.user`).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');

    const ok = await this.permissions.hasAll(user, required);
    if (!ok) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }
    return true;
  }
}
