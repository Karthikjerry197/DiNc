import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardLayoutRepository } from './dashboard-layout.repository';
import { ProgramMetadataRepository } from './program-metadata.repository';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardLayoutRepository, ProgramMetadataRepository],
})
export class DashboardModule {}
