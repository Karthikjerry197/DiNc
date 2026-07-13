import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CitizensModule } from '../citizens/citizens.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { DataQualityController } from './data-quality.controller';
import { DataQualityRepository } from './data-quality.repository';
import { DataQualityService } from './data-quality.service';

/**
 * Data Quality module — owns the Duplicate Request workflow. Follows the
 * established Controller → Service → Repository → PostgreSQL architecture, reuses
 * the global DatabaseService and the existing JwtAuthGuard (via AuthModule), and
 * imports CitizensModule + EnrollmentModule so the side-by-side comparison reuses
 * their read services instead of duplicating SQL.
 */
@Module({
  imports: [AuthModule, CitizensModule, EnrollmentModule, ReferenceDataModule],
  controllers: [DataQualityController],
  providers: [DataQualityService, DataQualityRepository],
})
export class DataQualityModule {}
