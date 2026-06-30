import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { SchedulerController } from './scheduler.controller';
import { SchedulerRepository } from './scheduler.repository';
import { SchedulerService } from './scheduler.service';

/**
 * Scheduler & Automation Engine module. Runs due (overdue) activities through the
 * existing Workflow Rules Engine on a configurable interval — adding timing
 * without duplicating workflow/retry logic. Reuses WorkflowModule (the engine),
 * the global DatabaseService, and the existing JwtAuthGuard via AuthModule.
 *
 * NOTE: ScheduleModule.forRoot() is registered once in AppModule, which provides
 * the SchedulerRegistry this service uses to manage its interval.
 */
@Module({
  imports: [AuthModule, WorkflowModule],
  controllers: [SchedulerController],
  providers: [SchedulerService, SchedulerRepository],
})
export class SchedulerModule {}
