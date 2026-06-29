import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CitizensController } from './citizens.controller';
import { CitizensService } from './citizens.service';

/**
 * Citizen Workspace feature module. Reuses the global DatabaseService for
 * read-only queries and imports AuthModule to reuse the existing JwtAuthGuard —
 * no authentication logic is duplicated or modified.
 */
@Module({
  imports: [AuthModule],
  controllers: [CitizensController],
  providers: [CitizensService],
  // Exported so the Data Quality module can reuse the citizen reader for the
  // side-by-side duplicate comparison without duplicating its SQL.
  exports: [CitizensService],
})
export class CitizensModule {}
