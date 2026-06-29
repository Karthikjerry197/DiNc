import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivityModule } from '../activity/activity.module';
import { GuidebooksModule } from '../guidebooks/guidebooks.module';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentRepository } from './enrollment.repository';
import { EnrollmentService } from './enrollment.service';

/**
 * Program & Enrollment Management module. Follows the established
 * Controller → Service → Repository → PostgreSQL architecture. Reuses the global
 * DatabaseService, the existing JwtAuthGuard via AuthModule, and ActivityModule
 * to auto-create the initial activity on enrollment.
 */
@Module({
  imports: [AuthModule, ActivityModule, GuidebooksModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService, EnrollmentRepository],
  // Exported so the Data Quality module can reuse the enrollment reader and the
  // context-aware guidebook resolver for the duplicate comparison.
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
