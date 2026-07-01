import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
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

  @Get('alerts/active')
  getActiveAlerts() {
    return this.cdse.getActiveAlertsForBell();
  }

  @Get('citizens/:citizenId/cdse-recommendations')
  evaluate(@Param('citizenId') citizenId: string) {
    if (!UUID_RE.test(citizenId)) throw new NotFoundException('Citizen not found');
    return this.cdse.evaluate(citizenId);
  }
}
