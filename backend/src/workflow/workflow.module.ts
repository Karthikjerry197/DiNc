import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivityModule } from '../activity/activity.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { WorkflowController } from './workflow.controller';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowRepository } from './workflow.repository';
import { WorkflowService } from './workflow.service';

/**
 * Workflow Rules Engine module. Owns the engine (execution), the admin service
 * (configuration) and the repository (the only place with rules/retry SQL). It
 * reuses the Activity and Enrollment modules to perform actions, so workflow
 * logic lives here and nowhere else.
 *
 * Exports WorkflowEngine so the Consultation module can delegate post-outcome
 * processing to it instead of containing workflow logic of its own.
 */
@Module({
  imports: [AuthModule, ActivityModule, EnrollmentModule],
  controllers: [WorkflowController],
  providers: [WorkflowEngine, WorkflowService, WorkflowRepository],
  exports: [WorkflowEngine],
})
export class WorkflowModule {}
