import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CdseService } from './cdse.service';
import type { CdsResponse } from './cdse.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Clinical Decision Support Engine API.
 *
 * Route follows the established citizen-scoped pattern used throughout the
 * consultation module: GET /citizens/:citizenId/<resource>.
 *
 * The response is always safe to call — it never modifies any data and
 * gracefully degrades if individual data sources are unavailable (returns
 * empty recommendations rather than an error).
 */
@Controller('citizens')
@UseGuards(JwtAuthGuard)
export class CdseController {
  constructor(private readonly cdse: CdseService) {}

  /**
   * Evaluate all clinical rules for a citizen and return structured
   * recommendations with explanations and an overall risk level.
   *
   * GET /api/citizens/:citizenId/cdse-recommendations
   */
  @Get(':citizenId/cdse-recommendations')
  evaluate(@Param('citizenId') citizenId: string): Promise<CdsResponse> {
    if (!UUID_RE.test(citizenId)) throw new NotFoundException('Citizen not found');
    return this.cdse.evaluate(citizenId);
  }
}
