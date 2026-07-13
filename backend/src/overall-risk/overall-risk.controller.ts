import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OverallRiskService } from './overall-risk.service';
import { ResolveBatchDto } from './dto/resolve-batch.dto';
import {
  OverallRiskBatchResultDto,
  OverallRiskMatrixEntryDto,
  OverallRiskResolutionDto,
} from './overall-risk.types';

/**
 * Overall Risk API. Read-only and open to any authenticated user — the Patient
 * Intelligence workspace resolves a citizen's overall risk from the two engine
 * inputs it already computed. The decision matrix lives in PostgreSQL; this
 * controller never encodes risk logic.
 */
@Controller('overall-risk')
@UseGuards(JwtAuthGuard)
export class OverallRiskController {
  constructor(private readonly service: OverallRiskService) {}

  /** The full decision matrix — for inspection and the admin/config surface. */
  @Get('matrix')
  matrix(): Promise<OverallRiskMatrixEntryDto[]> {
    return this.service.getMatrix();
  }

  /**
   * Resolve one pair. e.g.
   *   GET /api/overall-risk/resolve?clinicalSeverity=SEVERE&followupRisk=LOW
   * Accepts the CDSE category (NONE|LOW|MODERATE|SEVERE) for severity and either
   * the classified band or the display band (LOW|MEDIUM/MODERATE|HIGH) for
   * follow-up; both are normalised server-side before the matrix lookup.
   */
  @Get('resolve')
  resolve(
    @Query('clinicalSeverity') clinicalSeverity: string,
    @Query('followupRisk') followupRisk: string,
  ): Promise<OverallRiskResolutionDto> {
    return this.service.resolve(clinicalSeverity, followupRisk);
  }

  /**
   * Batch resolve for patient lists (Dashboard, Worklist). One request, one DB
   * round-trip for the matrix, many results. Each result is the single-resolve
   * shape plus the caller's `id`. Ids omitted from the response could not be
   * resolved and should render as "Pending Assessment".
   */
  @Post('resolve-batch')
  resolveBatch(@Body() body: ResolveBatchDto): Promise<OverallRiskBatchResultDto[]> {
    return this.service.resolveMany(body.items);
  }
}
