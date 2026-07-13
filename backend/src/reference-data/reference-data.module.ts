import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReferenceDataController } from './reference-data.controller';
import { ReferenceDataService } from './reference-data.service';
import { ReferenceDataRepository } from './reference-data.repository';

/**
 * Reference Data module — the generic, DB-backed business-vocabulary framework.
 * Follows the Controller → Service → Repository → PostgreSQL architecture, reuses
 * the global DatabaseService and RBAC PermissionsGuard, and exposes the service so
 * other backend modules can resolve reference values without duplicating SQL.
 */
@Module({
  imports: [AuthModule],
  controllers: [ReferenceDataController],
  providers: [ReferenceDataService, ReferenceDataRepository],
  exports: [ReferenceDataService],
})
export class ReferenceDataModule {}
