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
})
export class CitizensModule {}
