import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeRepository } from './knowledge.repository';
import { KnowledgeService } from './knowledge.service';

/**
 * Knowledge Hub module (FAQ, Training, Emergency, Search). Read-only over the
 * existing faqs / training_modules / guidebooks tables, plus FAQ administration.
 * Reuses the global DatabaseService and the existing JwtAuthGuard via AuthModule.
 */
@Module({
  imports: [AuthModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeRepository],
})
export class KnowledgeModule {}
