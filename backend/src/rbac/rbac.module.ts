import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { RbacRepository } from './rbac.repository';

/**
 * RBAC foundation module (Milestone 1). Provisions the normalized RBAC schema,
 * seeds it from the current permission registry, and exposes read APIs. Additive
 * only — existing permission enforcement is unchanged until Milestone 4.
 */
@Module({
  imports: [AuthModule],
  controllers: [RbacController],
  providers: [RbacService, RbacRepository],
  exports: [RbacService, RbacRepository],
})
export class RbacModule {}
