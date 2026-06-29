import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivityModule } from '../activity/activity.module';
import { GuidebooksModule } from '../guidebooks/guidebooks.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ConsultationController } from './consultation.controller';
import { ConsultationRepository } from './consultation.repository';
import { ConsultationService } from './consultation.service';

/**
 * Teleconsultation module. Gathers consultation context, records the outcome +
 * clinical observations, and DELEGATES every workflow decision to the Workflow
 * Rules Engine (imported via WorkflowModule). It owns only the consultation
 * read/record SQL (context, template, outcome_records, contact_outcomes,
 * timeline). Reuses ActivityModule (lifecycle writes + reads) and GuidebooksModule
 * (context-aware guidebook), and the existing JwtAuthGuard via AuthModule.
 */
@Module({
  imports: [AuthModule, ActivityModule, GuidebooksModule, WorkflowModule],
  controllers: [ConsultationController],
  providers: [ConsultationService, ConsultationRepository],
})
export class ConsultationModule {}
