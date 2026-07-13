import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OverallRiskController } from './overall-risk.controller';
import { OverallRiskService } from './overall-risk.service';
import { OverallRiskRepository } from './overall-risk.repository';

/**
 * Overall Risk module — the matrix-driven Overall Risk Engine.
 *
 * Follows the Controller → Service → Repository → PostgreSQL architecture, reuses
 * the global DatabaseService and the JWT guard, and exports the service so other
 * backend modules can resolve overall risk without duplicating the matrix lookup.
 * The risk decision is data (the `overall_risk_matrix` table), never code.
 */
@Module({
  imports: [AuthModule],
  controllers: [OverallRiskController],
  providers: [OverallRiskService, OverallRiskRepository],
  exports: [OverallRiskService],
})
export class OverallRiskModule {}
