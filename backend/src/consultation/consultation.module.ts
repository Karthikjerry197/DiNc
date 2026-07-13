import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivityModule } from '../activity/activity.module';
import { CdseModule } from '../cdse/cdse.module';
import { GuidebooksModule } from '../guidebooks/guidebooks.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { ConsultationController } from './consultation.controller';
import { ConsultationRepository } from './consultation.repository';
import { ConsultationService } from './consultation.service';

/**
 * Consultation & Outcome Engine (Step 7). Records call_log + outcome_response
 * from metadata templates; lifecycle consequences run through the Activity
 * module (Step 6A) and the Scheduler engine (Step 6B) — the legacy
 * WorkflowModule dependency is gone (its migration is Step 8).
 */
@Module({
  imports: [AuthModule, ActivityModule, CdseModule, GuidebooksModule, SchedulerModule],
  controllers: [ConsultationController],
  providers: [ConsultationService, ConsultationRepository],
})
export class ConsultationModule {}
