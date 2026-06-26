import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuidebooksModule } from '../guidebooks/guidebooks.module';
import { WorklistController } from './worklist.controller';
import { WorklistService } from './worklist.service';

/**
 * Worklist feature module. Reuses the global DatabaseService for read-only
 * queries, AuthModule for the existing JwtAuthGuard, and GuidebooksModule for
 * context-aware guidebook resolution — no logic is duplicated.
 */
@Module({
  imports: [AuthModule, GuidebooksModule],
  controllers: [WorklistController],
  providers: [WorklistService],
})
export class WorklistModule {}
