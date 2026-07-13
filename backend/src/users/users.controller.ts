import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { UsersService } from './users.service';
import { AdminUserDto } from './user.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Administration API for Users & Roles. JWT-guarded and — since the Milestone 4
 * enforcement flip — authorized by the database-driven {@link PermissionsGuard}
 * against the `admin.pages` permission (Access Administration). The `@Req()` is
 * retained only where the acting administrator's identity is needed for auditing.
 */
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('admin.pages')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<AdminUserDto[]> {
    return this.users.listUsers();
  }

  @Get('roles')
  async roles(): Promise<{ roles: string[] }> {
    return { roles: await this.users.listAssignableRoles() };
  }

  @Post()
  create(@Body() body: CreateUserDto): Promise<AdminUserDto> {
    return this.users.createUser(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @Req() req: Request,
  ): Promise<AdminUserDto> {
    UsersController.requireUuid(id);
    const actor = (req as Request & { user: JwtPayload }).user;
    return this.users.updateUser(id, body, actor.sub);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Param('id') id: string,
    @Body() body: ResetPasswordDto,
  ): Promise<void> {
    UsersController.requireUuid(id);
    await this.users.resetPassword(id, body.newPassword);
  }

  private static requireUuid(id: string): void {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('User not found.');
    }
  }
}
