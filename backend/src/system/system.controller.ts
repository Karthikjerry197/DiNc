import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { SystemService } from './system.service';
import { SystemSettingsDto } from './system.types';

/**
 * Administration API for System Settings. JWT-guarded and — since the Milestone 4
 * enforcement flip — authorized by the database-driven {@link PermissionsGuard}
 * against the `admin.pages` permission (Access Administration). Read-only: it
 * exposes a unified view of existing configuration and has no write endpoints.
 */
@Controller('system-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('admin.pages')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get()
  getSettings(): SystemSettingsDto {
    return this.system.getSettings();
  }
}
