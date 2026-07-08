import {
  Body,
  Controller,
  ForbiddenException,
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
import { RbacService } from './rbac.service';
import { SetUserRolesDto } from './dto/set-user-roles.dto';
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
 * RBAC read API (Milestone 1). JWT-guarded and administrator-only, following the
 * established per-controller requireAdmin pattern (mirrors UsersController).
 * These endpoints back the User & Role workspaces built in Milestones 2–3.
 */
@Controller('rbac')
@UseGuards(JwtAuthGuard)
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('permissions')
  permissions(@Req() req: Request): Promise<RbacPermissionGroupDto[]> {
    RbacController.requireAdmin(req);
    return this.rbac.getPermissionCatalogue();
  }

  @Get('roles')
  roles(@Req() req: Request): Promise<RbacRoleSummaryDto[]> {
    RbacController.requireAdmin(req);
    return this.rbac.listRoles();
  }

  @Get('roles/:idOrKey')
  role(@Param('idOrKey') idOrKey: string, @Req() req: Request): Promise<RbacRoleDetailDto> {
    RbacController.requireAdmin(req);
    return this.rbac.getRole(idOrKey);
  }

  @Post('roles')
  createRole(@Body() body: CreateRoleDto, @Req() req: Request): Promise<RbacRoleDetailDto> {
    RbacController.requireAdmin(req);
    return this.rbac.createRole(body);
  }

  @Patch('roles/:idOrKey')
  updateRole(
    @Param('idOrKey') idOrKey: string,
    @Body() body: UpdateRoleDto,
    @Req() req: Request,
  ): Promise<RbacRoleDetailDto> {
    RbacController.requireAdmin(req);
    return this.rbac.updateRole(idOrKey, body);
  }

  @Put('roles/:idOrKey/permissions')
  setRolePermissions(
    @Param('idOrKey') idOrKey: string,
    @Body() body: SetRolePermissionsDto,
    @Req() req: Request,
  ): Promise<RbacRoleDetailDto> {
    RbacController.requireAdmin(req);
    return this.rbac.setRolePermissions(idOrKey, body.permissionKeys);
  }

  @Get('users/:id/access')
  userAccess(@Param('id') id: string, @Req() req: Request): Promise<RbacUserAccessDto> {
    RbacController.requireAdmin(req);
    if (!UUID_RE.test(id)) throw new NotFoundException('User not found.');
    return this.rbac.getUserAccess(id);
  }

  @Put('users/:id/roles')
  setUserRoles(
    @Param('id') id: string,
    @Body() body: SetUserRolesDto,
    @Req() req: Request,
  ): Promise<RbacUserAccessDto> {
    RbacController.requireAdmin(req);
    if (!UUID_RE.test(id)) throw new NotFoundException('User not found.');
    return this.rbac.setUserRoles(id, body.roleKeys);
  }

  private static requireAdmin(req: Request): JwtPayload {
    const user = (req as Request & { user?: JwtPayload }).user;
    if ((user?.role ?? '').toUpperCase() !== 'ADMIN') {
      throw new ForbiddenException('Administrator access is required.');
    }
    return user as JwtPayload;
  }
}
