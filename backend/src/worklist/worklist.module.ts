import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorklistController } from './worklist.controller';
import { WorklistService } from './worklist.service';

/**
 * Worklist feature module. Reuses the global DatabaseService for read-only
 * queries and imports AuthModule to reuse the existing JwtAuthGuard — no
 * authentication logic is duplicated or modified.
 */
@Module({
  imports: [AuthModule],
  controllers: [WorklistController],
  providers: [WorklistService],
})
export class WorklistModule {}
