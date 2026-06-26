import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentRepository } from './enrollment.repository';
import { EnrollmentService } from './enrollment.service';

/**
 * Program & Enrollment Management module (read layer). Follows the established
 * Controller → Service → Repository → PostgreSQL architecture. Reuses the global
 * DatabaseService and the existing JwtAuthGuard via AuthModule.
 */
@Module({
  imports: [AuthModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService, EnrollmentRepository],
})
export class EnrollmentModule {}
