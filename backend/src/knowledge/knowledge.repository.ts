import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  EmergencyProtocolDto,
  FaqDto,
  SearchHit,
  TrainingModuleDto,
} from './knowledge.types';

/**
 * Data-access layer for the Knowledge Hub. The ONLY place holding its SQL. Reads
 * the existing faqs, training_modules and guidebooks tables and owns the FAQ
 * write path (the only editable knowledge content in this milestone). No new
 * tables; all reads are parameterised.
 */
@Injectable()
export class KnowledgeRepository {
  constructor(private readonly db: DatabaseService) {}

  // ── FAQ ────────────────────────────────────────────────────────────────────

  async listFaqs(): Promise<FaqDto[]> {
    const result = await this.db.query<{
      id: string;
      category: string | null;
      question: string;
      answer: string;
    }>(
      `SELECT id, category, question, answer
       FROM public.faqs
       WHERE is_active = true
       ORDER BY category NULLS LAST, question`,
    );
    return result.rows;
  }

  async faqExists(id: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM public.faqs WHERE id = $1) AS exists`,
      [id],
    );
    return result.rows[0]?.exists ?? false;
  }

  async insertFaq(input: { question: string; answer: string; category: string | null }): Promise<FaqDto> {
    const result = await this.db.query<{
      id: string;
      category: string | null;
      question: string;
      answer: string;
    }>(
      `INSERT INTO public.faqs (category, question, answer)
       VALUES ($1, $2, $3)
       RETURNING id, category, question, answer`,
      [input.category, input.question, input.answer],
    );
    return result.rows[0];
  }

  async updateFaq(
    id: string,
    input: { question: string; answer: string; category: string | null },
  ): Promise<FaqDto | null> {
    const result = await this.db.query<{
      id: string;
      category: string | null;
      question: string;
      answer: string;
    }>(
      `UPDATE public.faqs
         SET category = $2, question = $3, answer = $4, updated_at = now()
       WHERE id = $1
       RETURNING id, category, question, answer`,
      [id, input.category, input.question, input.answer],
    );
    return result.rows[0] ?? null;
  }

  /** Soft-delete (keeps history; matches the is_active convention everywhere). */
  async deactivateFaq(id: string): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `UPDATE public.faqs SET is_active = false, updated_at = now()
       WHERE id = $1 AND is_active = true
       RETURNING id`,
      [id],
    );
    return result.rows.length > 0;
  }

  // ── Training ─────────────────────────────────────────────────────────────────

  async listTraining(): Promise<TrainingModuleDto[]> {
    const result = await this.db.query<{
      id: string;
      code: string;
      title: string;
      category: string | null;
      description: string | null;
      duration_minutes: number | null;
      content: string | null;
    }>(
      `SELECT id, code, title, category, description, duration_minutes, content
       FROM public.training_modules
       WHERE is_active = true
       ORDER BY category NULLS LAST, title`,
    );
    return result.rows.map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      category: r.category,
      description: r.description,
      durationMinutes: r.duration_minutes,
      content: r.content,
    }));
  }

  // ── Emergency (structured guidebook protocols) ───────────────────────────────

  async emergencyProtocols(): Promise<EmergencyProtocolDto[]> {
    const result = await this.db.query<{
      id: string;
      code: string;
      category: string;
      title: string;
      summary: string | null;
      key_steps: string | null;
      escalation_criteria: string | null;
      source: string | null;
    }>(
      `SELECT id, code, category, title, summary, key_steps, escalation_criteria, source
       FROM public.guidebooks
       WHERE is_active = true
       ORDER BY (category = 'EMERGENCY') DESC, category, title`,
    );
    return result.rows.map((r) => ({
      id: r.id,
      code: r.code,
      category: r.category,
      title: r.title,
      recognition: r.summary,
      immediateManagement: KnowledgeRepository.toList(r.key_steps),
      referralCriteria: KnowledgeRepository.toList(r.escalation_criteria),
      notes: r.source,
    }));
  }

  // ── Unified search ───────────────────────────────────────────────────────────

  async searchFaqs(term: string): Promise<SearchHit[]> {
    const result = await this.db.query<{ id: string; question: string; answer: string; category: string | null }>(
      `SELECT id, question, answer, category FROM public.faqs
       WHERE is_active = true AND (question ILIKE $1 OR answer ILIKE $1 OR category ILIKE $1)
       ORDER BY question LIMIT 10`,
      [term],
    );
    return result.rows.map((r) => ({
      id: r.id,
      title: r.question,
      snippet: KnowledgeRepository.snippet(r.answer),
      category: r.category,
    }));
  }

  async searchTraining(term: string): Promise<SearchHit[]> {
    const result = await this.db.query<{ id: string; title: string; description: string | null; category: string | null }>(
      `SELECT id, title, description, category FROM public.training_modules
       WHERE is_active = true AND (title ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)
       ORDER BY title LIMIT 10`,
      [term],
    );
    return result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      snippet: KnowledgeRepository.snippet(r.description),
      category: r.category,
    }));
  }

  async searchGuidebooks(term: string): Promise<SearchHit[]> {
    const result = await this.db.query<{ id: string; title: string; summary: string | null; category: string }>(
      `SELECT id, title, summary, category FROM public.guidebooks
       WHERE is_active = true AND (title ILIKE $1 OR summary ILIKE $1 OR category ILIKE $1)
       ORDER BY title LIMIT 10`,
      [term],
    );
    return result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      snippet: KnowledgeRepository.snippet(r.summary),
      category: r.category,
    }));
  }

  /** Splits a "; "/newline-separated string into trimmed, non-empty items. */
  private static toList(value: string | null): string[] {
    if (!value) return [];
    return value.split(/[;\n]+/).map((p) => p.trim()).filter((p) => p.length > 0);
  }

  private static snippet(text: string | null): string | null {
    if (!text) return null;
    const t = text.trim();
    return t.length > 140 ? `${t.slice(0, 140)}…` : t;
  }
}
