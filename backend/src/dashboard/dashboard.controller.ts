import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { AdminDashboardSummary } from './dashboard.types';

/**
 * Dashboard data API. Protected by the same JWT guard used in Milestone 1,
 * so only authenticated sessions can read summary data.
 *
 * The route is namespaced per role (`admin/...`) so additional role dashboards
 * (Clinical Staff, Care Assistant, Guest) can be added in future milestones
 * without disturbing this one.
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('admin/summary')
  @UseGuards(JwtAuthGuard)
  getAdminSummary(): Promise<AdminDashboardSummary> {
    return this.dashboard.getAdminSummary();
  }
}
