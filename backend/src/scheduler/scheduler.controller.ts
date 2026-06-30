import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { SchedulerService } from './scheduler.service';
import { SchedulerRunDto, SchedulerStatusDto } from './scheduler.types';

/**
 * Administration API for the Scheduler. Protected by the existing JWT guard and
 * restricted to administrators. The automatic cycle runs internally; these
 * endpoints expose status and a manual "Run Now" trigger for testing.
 */
@Controller('scheduler')
@UseGuards(JwtAuthGuard)
export class SchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  @Get('status')
  status(@Req() req: Request): Promise<SchedulerStatusDto> {
    SchedulerController.requireAdmin(req);
    return this.scheduler.getStatus();
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  run(@Req() req: Request): Promise<SchedulerRunDto> {
    SchedulerController.requireAdmin(req);
    return this.scheduler.runCycle('MANUAL');
  }

  private static requireAdmin(req: Request): void {
    const user = (req as Request & { user?: JwtPayload }).user;
    if ((user?.role ?? '').toUpperCase() !== 'ADMIN') {
      throw new ForbiddenException('Administrator access is required.');
    }
  }
}
