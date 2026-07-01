import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CdseController } from './cdse.controller';
import { CdseRepository } from './cdse.repository';
import { CdseService } from './cdse.service';

/**
 * CDSE module — Milestone 25 redesign.
 *
 * Replaced the disease-specific rule engine with a category-based classifier.
 * CdseService.classify() reads counselling item categories from the DB and
 * applies deterministic rules. No disease knowledge lives here.
 */
@Module({
  imports: [AuthModule],
  controllers: [CdseController],
  providers: [CdseService, CdseRepository],
  exports: [CdseService, CdseRepository],
})
export class CdseModule {}
