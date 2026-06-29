import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
