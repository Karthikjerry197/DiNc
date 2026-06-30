import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardLayoutRepository } from './dashboard-layout.repository';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardLayoutRepository],
})
export class DashboardModule {}
