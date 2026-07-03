import {
  Body,
  Controller,
  ForbiddenException,
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
import { UsersService } from './users.service';
import { AdminUserDto, ASSIGNABLE_ROLES } from './user.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Administration API for Users & Roles. JWT-guarded and restricted to
 * administrators, following the established per-controller requireAdmin pattern.
 */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Req() req: Request): Promise<AdminUserDto[]> {
    UsersController.requireAdmin(req);
    return this.users.listUsers();
  }

  @Get('roles')
  roles(@Req() req: Request): { roles: string[] } {
    UsersController.requireAdmin(req);
    return { roles: [...ASSIGNABLE_ROLES] };
  }

  @Post()
  create(@Body() body: CreateUserDto, @Req() req: Request): Promise<AdminUserDto> {
    UsersController.requireAdmin(req);
    return this.users.createUser(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @Req() req: Request,
  ): Promise<AdminUserDto> {
    const actor = UsersController.requireAdmin(req);
    UsersController.requireUuid(id);
    return this.users.updateUser(id, body, actor.sub);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Param('id') id: string,
    @Body() body: ResetPasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    UsersController.requireAdmin(req);
    UsersController.requireUuid(id);
    await this.users.resetPassword(id, body.newPassword);
  }

  private static requireAdmin(req: Request): JwtPayload {
    const user = (req as Request & { user?: JwtPayload }).user;
    if ((user?.role ?? '').toUpperCase() !== 'ADMIN') {
      throw new ForbiddenException('Administrator access is required.');
    }
    return user as JwtPayload;
  }

  private static requireUuid(id: string): void {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('User not found.');
    }
  }
}
