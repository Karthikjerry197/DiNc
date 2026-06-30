/**
 * Types for the Knowledge Hub (FAQ, Training, Emergency, Search).
 *
 * Every value is read from existing tables — faqs, training_modules and
 * guidebooks (the structured "emergency-related records", since knowledge_assets
 * holds only file assets). No knowledge content is hardcoded and no duplicate
 * tables are introduced.
 */

export interface FaqDto {
  id: string;
  category: string | null;
  question: string;
  answer: string;
}

export interface CategoryCount {
  name: string;
  count: number;
}

export interface FaqListDto {
  faqs: FaqDto[];
  categories: CategoryCount[];
}

export interface TrainingModuleDto {
  id: string;
  code: string;
  title: string;
  category: string | null;
  description: string | null;
  durationMinutes: number | null;
  /** Long-form module content (used for the in-app reader / future quizzes). */
  content: string | null;
}

/** An emergency/clinical protocol assembled from a guidebook record. */
export interface EmergencyProtocolDto {
  id: string;
  code: string;
  category: string;
  title: string;
  recognition: string | null;
  immediateManagement: string[];
  referralCriteria: string[];
  notes: string | null;
}

/** A single hit in the unified knowledge search. */
export interface SearchHit {
  id: string;
  title: string;
  snippet: string | null;
  category: string | null;
}

export interface KnowledgeSearchResultDto {
  query: string;
  faqs: SearchHit[];
  training: SearchHit[];
  guidebooks: SearchHit[];
}
