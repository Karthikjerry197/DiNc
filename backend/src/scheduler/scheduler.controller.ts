import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { SchedulerService } from './scheduler.service';
import { SchedulerRunDto, SchedulerStatusDto } from './scheduler.types';

/**
 * Administration API for the Scheduler. JWT-guarded and — since the Milestone 4
 * enforcement flip — authorized by the database-driven {@link PermissionsGuard}
 * against the `admin.scheduler` permission (Scheduler Configuration). The
 * automatic cycle runs internally; these endpoints expose status and a manual
 * "Run Now" trigger for testing.
 */
@Controller('scheduler')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('admin.scheduler')
export class SchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  @Get('status')
  status(): Promise<SchedulerStatusDto> {
    return this.scheduler.getStatus();
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  run(): Promise<SchedulerRunDto> {
    return this.scheduler.runCycle('MANUAL');
  }
}
