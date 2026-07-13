import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './require-permissions.decorator';
import { RbacService } from './rbac.service';
import { SetUserRolesDto } from './dto/set-user-roles.dto';
import { SetUserOverridesDto } from './dto/set-user-overrides.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import type {
  RbacPermissionGroupDto,
  RbacRoleDetailDto,
  RbacRoleSummaryDto,
  RbacUserAccessDto,
} from './rbac.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RBAC administration API. JWT-guarded and — since the Milestone 4 enforcement
 * flip — authorized by the database-driven {@link PermissionsGuard} against the
 * `admin.pages` permission (Access Administration), which backs the User & Role
 * workspaces. The `@Req()` is retained only where the acting administrator's
 * identity is recorded (override authorship).
 */
@Controller('rbac')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('admin.pages')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('permissions')
  permissions(): Promise<RbacPermissionGroupDto[]> {
    return this.rbac.getPermissionCatalogue();
  }

  @Get('roles')
  roles(): Promise<RbacRoleSummaryDto[]> {
    return this.rbac.listRoles();
  }

  @Get('roles/:idOrKey')
  role(@Param('idOrKey') idOrKey: string): Promise<RbacRoleDetailDto> {
    return this.rbac.getRole(idOrKey);
  }

  @Post('roles')
  createRole(@Body() body: CreateRoleDto): Promise<RbacRoleDetailDto> {
    return this.rbac.createRole(body);
  }

  @Patch('roles/:idOrKey')
  updateRole(
    @Param('idOrKey') idOrKey: string,
    @Body() body: UpdateRoleDto,
  ): Promise<RbacRoleDetailDto> {
    return this.rbac.updateRole(idOrKey, body);
  }

  @Put('roles/:idOrKey/permissions')
  setRolePermissions(
    @Param('idOrKey') idOrKey: string,
    @Body() body: SetRolePermissionsDto,
  ): Promise<RbacRoleDetailDto> {
    return this.rbac.setRolePermissions(idOrKey, body.permissionKeys);
  }

  @Get('users/:id/access')
  userAccess(@Param('id') id: string): Promise<RbacUserAccessDto> {
    if (!UUID_RE.test(id)) throw new NotFoundException('User not found.');
    return this.rbac.getUserAccess(id);
  }

  @Put('users/:id/roles')
  setUserRoles(
    @Param('id') id: string,
    @Body() body: SetUserRolesDto,
  ): Promise<RbacUserAccessDto> {
    if (!UUID_RE.test(id)) throw new NotFoundException('User not found.');
    return this.rbac.setUserRoles(id, body.roleKeys);
  }

  /** Replace a user's per-user permission overrides (grant/deny). Empty = reset. */
  @Put('users/:id/overrides')
  setUserOverrides(
    @Param('id') id: string,
    @Body() body: SetUserOverridesDto,
    @Req() req: Request,
  ): Promise<RbacUserAccessDto> {
    if (!UUID_RE.test(id)) throw new NotFoundException('User not found.');
    const admin = (req as Request & { user: JwtPayload }).user;
    return this.rbac.setUserOverrides(id, body.overrides, admin.sub);
  }
}
