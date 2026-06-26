import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuidebooksController } from './guidebooks.controller';
import { GuidebooksService } from './guidebooks.service';

/**
 * Guidebooks feature module. Reuses the global DatabaseService for read-only
 * queries and imports AuthModule to reuse the existing JwtAuthGuard — no
 * authentication logic is duplicated or modified.
 */
@Module({
  imports: [AuthModule],
  controllers: [GuidebooksController],
  providers: [GuidebooksService],
  // Exported so Enrollment/Worklist modules can reuse the guidebook matcher for
  // context-aware navigation without duplicating the guide_rules logic.
  exports: [GuidebooksService],
})
export class GuidebooksModule {}
