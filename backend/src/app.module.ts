import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { WorklistModule } from './worklist/worklist.module';
import { CitizensModule } from './citizens/citizens.module';
import { GuidebooksModule } from './guidebooks/guidebooks.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { ActivityModule } from './activity/activity.module';
import { DataQualityModule } from './data-quality/data-quality.module';
import { ConsultationModule } from './consultation/consultation.module';
import { WorkflowModule } from './workflow/workflow.module';
import { RegistrationModule } from './registration/registration.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CdseModule } from './cdse/cdse.module';
import { CarePlanModule } from './care-plan/care-plan.module';
import { SystemModule } from './system/system.module';
import { RbacModule } from './rbac/rbac.module';
import { ReferenceDataModule } from './reference-data/reference-data.module';
import { OverallRiskModule } from './overall-risk/overall-risk.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    UsersModule,
    AuthModule,
    DashboardModule,
    WorklistModule,
    CitizensModule,
    GuidebooksModule,
    EnrollmentModule,
    ActivityModule,
    DataQualityModule,
    ConsultationModule,
    WorkflowModule,
    RegistrationModule,
    SchedulerModule,
    KnowledgeModule,
    AnalyticsModule,
    CdseModule,
    CarePlanModule,
    SystemModule,
    RbacModule,
    ReferenceDataModule,
    OverallRiskModule,
  ],
})
export class AppModule {}
