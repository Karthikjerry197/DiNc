import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivityModule } from '../activity/activity.module';
import { CdseModule } from '../cdse/cdse.module';
import { GuidebooksModule } from '../guidebooks/guidebooks.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ConsultationController } from './consultation.controller';
import { ConsultationRepository } from './consultation.repository';
import { ConsultationService } from './consultation.service';

@Module({
  imports: [AuthModule, ActivityModule, CdseModule, GuidebooksModule, WorkflowModule],
  controllers: [ConsultationController],
  providers: [ConsultationService, ConsultationRepository],
})
export class ConsultationModule {}
