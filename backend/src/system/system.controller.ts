import {
  Controller,
  ForbiddenException,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { SystemService } from './system.service';
import { SystemSettingsDto } from './system.types';

/**
 * Administration API for System Settings. JWT-guarded and restricted to
 * administrators, following the established per-controller requireAdmin pattern.
 * Read-only: it exposes a unified view of existing configuration and has no
 * write endpoints.
 */
@Controller('system-settings')
@UseGuards(JwtAuthGuard)
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get()
  getSettings(@Req() req: Request): SystemSettingsDto {
    SystemController.requireAdmin(req);
    return this.system.getSettings();
  }

  private static requireAdmin(req: Request): void {
    const user = (req as Request & { user?: JwtPayload }).user;
    if ((user?.role ?? '').toUpperCase() !== 'ADMIN') {
      throw new ForbiddenException('Administrator access is required.');
    }
  }
}
