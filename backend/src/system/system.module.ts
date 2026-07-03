import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

/**
 * System Settings module — an administrator-facing, read-only view over existing
 * configuration. Reuses AuthModule (JwtAuthGuard) and the global ConfigService;
 * adds no storage, no schema, and no new settings of its own.
 */
@Module({
  imports: [AuthModule],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
