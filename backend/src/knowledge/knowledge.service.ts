import { Injectable, NotFoundException } from '@nestjs/common';
import { KnowledgeRepository } from './knowledge.repository';
import { FaqDto as FaqInputDto } from './dto/faq.dto';
import {
  CategoryCount,
  EmergencyProtocolDto,
  FaqDto,
  FaqListDto,
  KnowledgeSearchResultDto,
  TrainingModuleDto,
} from './knowledge.types';

/**
 * Business layer for the Knowledge Hub. Assembles category counts, exposes FAQ
 * administration, and fans a single query across faqs / training_modules /
 * guidebooks for the unified search. Holds no SQL.
 */
@Injectable()
export class KnowledgeService {
  constructor(private readonly repo: KnowledgeRepository) {}

  async listFaqs(): Promise<FaqListDto> {
    const faqs = await this.repo.listFaqs();
    return { faqs, categories: KnowledgeService.countByCategory(faqs.map((f) => f.category)) };
  }

  createFaq(dto: FaqInputDto): Promise<FaqDto> {
    return this.repo.insertFaq({
      question: dto.question.trim(),
      answer: dto.answer.trim(),
      category: dto.category?.trim() || null,
    });
  }

  async updateFaq(id: string, dto: FaqInputDto): Promise<FaqDto> {
    const updated = await this.repo.updateFaq(id, {
      question: dto.question.trim(),
      answer: dto.answer.trim(),
      category: dto.category?.trim() || null,
    });
    if (!updated) throw new NotFoundException('FAQ not found.');
    return updated;
  }

  async deleteFaq(id: string): Promise<{ id: string; deleted: boolean }> {
    const ok = await this.repo.deactivateFaq(id);
    if (!ok) throw new NotFoundException('FAQ not found.');
    return { id, deleted: true };
  }

  listTraining(): Promise<TrainingModuleDto[]> {
    return this.repo.listTraining();
  }

  emergencyProtocols(): Promise<EmergencyProtocolDto[]> {
    return this.repo.emergencyProtocols();
  }

  async search(query: string): Promise<KnowledgeSearchResultDto> {
    const q = (query ?? '').trim();
    if (q.length < 2) {
      return { query: q, faqs: [], training: [], guidebooks: [] };
    }
    const term = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const [faqs, training, guidebooks] = await Promise.all([
      this.repo.searchFaqs(term),
      this.repo.searchTraining(term),
      this.repo.searchGuidebooks(term),
    ]);
    return { query: q, faqs, training, guidebooks };
  }

  private static countByCategory(categories: (string | null)[]): CategoryCount[] {
    const counts = new Map<string, number>();
    for (const c of categories) {
      const name = c ?? 'Uncategorised';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
}
