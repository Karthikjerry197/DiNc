import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorklistService } from './worklist.service';
import { WorklistOverview } from './worklist.types';

/**
 * Worklist data API. Protected by the existing JWT guard (reused from Milestone 1).
 * Namespaced under `admin/` so future role-specific worklist views can be added
 * without disturbing this one.
 */
@Controller('worklist')
export class WorklistController {
  constructor(private readonly worklist: WorklistService) {}

  @Get('admin/overview')
  @UseGuards(JwtAuthGuard)
  getAdminOverview(): Promise<WorklistOverview> {
    return this.worklist.getAdminOverview();
  }
}
