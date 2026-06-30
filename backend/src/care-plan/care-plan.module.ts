import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CdseModule } from '../cdse/cdse.module';
import { CarePlanController } from './care-plan.controller';
import { CarePlanRepository } from './care-plan.repository';
import { CarePlanService } from './care-plan.service';

/**
 * Longitudinal Care Plan Engine module.
 *
 * Provides the full Problem → Goal → Intervention → Progress hierarchy for
 * a citizen's integrated care plan. Imports CdseModule so the service can
 * call the CDSE evaluation pipeline when generating goal suggestions.
 */
@Module({
  imports: [AuthModule, CdseModule],
  controllers: [CarePlanController],
  providers: [CarePlanService, CarePlanRepository],
})
export class CarePlanModule {}
