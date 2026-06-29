import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RegistrationController } from './registration.controller';
import { RegistrationRepository } from './registration.repository';
import { RegistrationService } from './registration.service';

/**
 * Integrated Patient Registration module. Owns the atomic registration workflow
 * (citizen + enrollments + initial activities in one transaction) and bulk
 * registration. Reuses the global DatabaseService (incl. withTransaction) and the
 * existing JwtAuthGuard via AuthModule. It deliberately reuses the existing data
 * model rather than duplicating the Workflow Rules Engine or teleconsultation.
 */
@Module({
  imports: [AuthModule],
  controllers: [RegistrationController],
  providers: [RegistrationService, RegistrationRepository],
})
export class RegistrationModule {}
