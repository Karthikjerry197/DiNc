import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivityController } from './activity.controller';
import { ActivityRepository } from './activity.repository';
import { ActivityService } from './activity.service';

/**
 * Activity Management module (read layer). Follows the established
 * Controller → Service → Repository → PostgreSQL architecture. Reuses the global
 * DatabaseService and the existing JwtAuthGuard via AuthModule.
 */
@Module({
  imports: [AuthModule],
  controllers: [ActivityController],
  providers: [ActivityService, ActivityRepository],
  // Exported so EnrollmentModule can auto-create the initial activity on
  // enrollment without duplicating the worklist_items insert logic.
  exports: [ActivityService],
})
export class ActivityModule {}
