import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';

/**
 * Analytics Foundation module. Read-only aggregation over the existing
 * operational tables — the single module every future report builds on. Reuses
 * the global DatabaseService and the existing JwtAuthGuard via AuthModule. No new
 * tables, no duplicated business logic.
 */
@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRepository],
})
export class AnalyticsModule {}
