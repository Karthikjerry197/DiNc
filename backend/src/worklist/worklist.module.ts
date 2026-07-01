import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CdseModule } from '../cdse/cdse.module';
import { GuidebooksModule } from '../guidebooks/guidebooks.module';
import { WorklistController } from './worklist.controller';
import { WorklistService } from './worklist.service';

@Module({
  imports: [AuthModule, CdseModule, GuidebooksModule],
  controllers: [WorklistController],
  providers: [WorklistService],
})
export class WorklistModule {}
