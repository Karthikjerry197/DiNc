import { Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CdseService } from './cdse.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * CDSE API surface.
 *
 * New endpoints (Milestone 25):
 *   GET /api/citizens/:id/risk    — current risk summary for one citizen
 *   GET /api/citizens/:id/alerts  — all alerts (active + resolved) for one citizen
 *   GET /api/alerts/active        — active alerts across all citizens (notification bell)
 *
 * Legacy endpoint kept for Care Plan module backward compat:
 *   GET /api/citizens/:id/cdse-recommendations
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class CdseController {
  constructor(private readonly cdse: CdseService) {}

  @Get('citizens/:citizenId/risk')
  async getRisk(@Param('citizenId') citizenId: string) {
    if (!UUID_RE.test(citizenId)) throw new NotFoundException('Citizen not found');
    return this.cdse.getLatestRisk(citizenId);
  }

  @Get('citizens/:citizenId/alerts')
  async getAlerts(@Param('citizenId') citizenId: string) {
    if (!UUID_RE.test(citizenId)) throw new NotFoundException('Citizen not found');
    return this.cdse.getAllAlerts(citizenId);
  }

  /** SEVERE alerts feed. `?status=RESOLVED` returns resolved history instead of active. */
  @Get('alerts/active')
  getActiveAlerts(@Query('status') status?: string) {
    return this.cdse.getActiveAlertsForBell(
      20,
      status?.toUpperCase() === 'RESOLVED' ? 'RESOLVED' : 'ACTIVE',
    );
  }

  /** Marks one alert as read (bell / Notifications click). Idempotent. */
  @Post('alerts/:id/read')
  async markAlertRead(@Param('id') id: string) {
    if (!UUID_RE.test(id)) throw new NotFoundException('Alert not found');
    const found = await this.cdse.markAlertRead(id);
    if (!found) throw new NotFoundException('Alert not found');
    return { ok: true };
  }

  @Get('citizens/:citizenId/cdse-recommendations')
  evaluate(@Param('citizenId') citizenId: string) {
    if (!UUID_RE.test(citizenId)) throw new NotFoundException('Citizen not found');
    return this.cdse.evaluate(citizenId);
  }
}
