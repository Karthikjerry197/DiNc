import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Administrator Dashboard feature module.
 *
 * Reuses the global DatabaseService for read-only queries and imports AuthModule
 * to reuse the existing JwtAuthGuard (and its JwtService) — no authentication
 * logic is duplicated or modified here.
 */
@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
