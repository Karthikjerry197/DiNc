import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SchedulerController } from './scheduler.controller';
import { SchedulerRepository } from './scheduler.repository';
import { SchedulerService } from './scheduler.service';

/**
 * Metadata-driven Scheduler Engine module (Step 6B). On a configurable interval
 * it materialises runtime work from dinc_metadata.v_schedule_rule_effective —
 * seeding satisfied rules, continuing recurring streams, and raising follow-up
 * tasks for overdue events. Uses the global DatabaseService and the existing
 * JwtAuthGuard via AuthModule. The legacy WorkflowEngine dependency is gone:
 * the workflow engine's own migration is Step 8.
 *
 * NOTE: ScheduleModule.forRoot() is registered once in AppModule, which provides
 * the SchedulerRegistry this service uses to manage its interval.
 */
@Module({
  imports: [AuthModule],
  controllers: [SchedulerController],
  providers: [SchedulerService, SchedulerRepository],
  // Exported so the Consultation module (Step 7) can trigger a sweep after
  // activity completion instead of duplicating scheduling logic.
  exports: [SchedulerService],
})
export class SchedulerModule {}
