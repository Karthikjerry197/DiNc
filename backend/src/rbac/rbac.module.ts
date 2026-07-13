import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { RbacRepository } from './rbac.repository';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';

/**
 * RBAC module. Provisions and seeds the normalized RBAC schema, exposes the Role
 * and User workspace APIs, and — since Milestone 4 — provides the runtime
 * authorization primitives (`PermissionsService` + `PermissionsGuard`).
 *
 * Marked @Global so any controller can `@UseGuards(JwtAuthGuard, PermissionsGuard)`
 * and any service can inject `PermissionsService` without importing RbacModule,
 * avoiding module-graph cycles with Auth/Users.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [RbacController],
  providers: [RbacService, RbacRepository, PermissionsService, PermissionsGuard],
  exports: [RbacService, RbacRepository, PermissionsService, PermissionsGuard],
})
export class RbacModule {}
