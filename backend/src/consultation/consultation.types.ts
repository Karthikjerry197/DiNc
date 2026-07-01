/**
 * Types for the Teleconsultation surface.
 *
 * Workflow decisions are NOT made here. The consultation module only gathers the
 * context, records the chosen outcome and the clinical observations, then hands
 * off to the Workflow Rules Engine. The selectable outcomes come from the event's
 * `outcome_types` (database-driven), and the clinical form from the event's
 * `outcome_templates` row — so any CPHC program is supported without code changes.
 */
import type { GuidebookDetail } from '../guidebooks/guidebooks.types';
import type { ActivityDto } from '../activity/activity.types';

/** A single dynamic clinical field as stored in outcome_templates.fields. */
export interface ClinicalFieldDef {
  type: 'text' | 'longtext' | 'number' | 'dropdown' | 'radio' | string;
  label: string;
  options: string[];
  required: boolean;
  sortOrder: number;
}

/** Explicit status of a displayed counselling question (Milestone 25A). */
export type ConsultationResponseStatus =
  | 'ANSWERED'
  | 'NOT_ASSESSED'
  | 'NOT_PRESENTED';

/**
 * Abstract, response-type-agnostic input for persisting one consultation_response.
 *
 * This decouples the persistence layer from the legacy checkedItemIds / "YES"
 * model. The CALLER translates whatever the UI produces into this model — today
 * ConsultationService maps checkbox `checkedItemIds` to
 * `{ ANSWERED, responseValue: 'YES' }` and displayed-but-unchecked items to
 * `{ NOT_ASSESSED, responseValue: null }`. Future response types (BOOLEAN,
 * NUMBER, CHOICE, TEXT, YES_NO_UNKNOWN) can supply their own values here without
 * any change to the persistence layer.
 */
export interface ConsultationResponseInput {
  counsellingItemId: string;
  responseStatus: ConsultationResponseStatus;
  responseValue: string | null;
}

export interface PatientInfo {
  citizenId: string | null;
  uhid: string | null;
  fullName: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
  assignedWorker: string | null;
}

export interface ClinicalContext {
  program: string | null;
  activity: string | null;
  enrollmentStatus: string | null;
  enrollmentId: string;
  condition: string | null;
}

/** Telephony hand-off. tel: link now; a structured slot for future VOIP. */
export interface DialInfo {
  phone: string | null;
  telLink: string | null;
  provider: 'tel'; // future: 'voip' | 'sip' | ...
}

/** A selectable consultation outcome — sourced from the event's outcome_types. */
export interface OutcomeOption {
  id: string;
  code: string;
  name: string;
  category: string;
}

// ── Counselling engine (16B) ─────────────────────────────────────────────────

/** One selectable counselling item within a wizard section. */
export interface CounsellingItemDto {
  id: string;
  /** Display text shown to the field worker during counselling. */
  body: string;
  /** Text appended to the consultation note when this item is selected.
   *  Defaults to `body` when not separately configured in the database. */
  noteText: string;
  sortOrder: number;
}

/**
 * A logical grouping of counselling items (Lifestyle, Nutrition, Medicines, …).
 * Section names and item content come entirely from the database; nothing is
 * hardcoded in application code.
 */
export interface CounsellingSectionDto {
  id: string;
  name: string;
  sortOrder: number;
  items: CounsellingItemDto[];
}

// ─────────────────────────────────────────────────────────────────────────────

/** A persisted consultation note (DRAFT or FINAL). */
export interface ConsultationNoteDto {
  id: string;
  generatedNote: string;
  noteVersion: number;
  status: 'DRAFT' | 'FINAL';
  recordedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Everything the Teleconsultation window + outcome form need, in one payload. */
export interface ConsultationContextDto {
  activity: ActivityDto;
  patient: PatientInfo;
  clinicalContext: ClinicalContext;
  dial: DialInfo;
  /** Full guidebook detail (16A+): includes structured sections. Null when no guidebook matches. */
  guidebook: GuidebookDetail | null;
  /** Dynamic, program-specific clinical fields (from the event's template). */
  clinicalForm: {
    templateId: string | null;
    templateName: string | null;
    fields: ClinicalFieldDef[];
  };
  /** Configurable outcomes for this event (drives the workflow rules engine). */
  outcomeOptions: OutcomeOption[];
  /** The most recent DRAFT note for this activity, if any (for workspace resume). */
  previousNote: ConsultationNoteDto | null;
  /**
   * Database-driven counselling sections for the wizard (16B+).
   * Empty array when the resolved guidebook has no counselling content yet.
   * Section names and item content are fully managed in the database.
   */
  counsellingSections: CounsellingSectionDto[];
}

/**
 * Result of saving a consultation. The lifecycle fields (status changes, next
 * activity, escalation) are produced by the Workflow Rules Engine, not here.
 */
export interface SaveConsultationResultDto {
  activity: ActivityDto;
  nextActivity: ActivityDto | null;
  enrollmentStatus: string | null;
  outcomeRecordId: string;
  /** The workflow action the engine executed, for UI feedback. */
  workflowAction: string;
  workflowMessage: string;
  escalated: boolean;
}

/** Result of starting a call. */
export interface StartCallResultDto {
  activity: ActivityDto;
  dial: DialInfo;
  attemptNumber: number;
}

/** One entry in a patient's longitudinal timeline. */
export interface TimelineEntryDto {
  kind: 'ENROLLMENT' | 'ACTIVITY';
  id: string;
  title: string;
  program: string | null;
  status: string;
  date: string | null;
  /** For activities: the consultation outcome recorded. */
  outcome: string | null;
  priority: string | null;
}

/**
 * One entry in the Clinical Journey — a unified, reverse-chronological view
 * of every clinical event for a citizen. Aggregated from enrollments,
 * worklist_items, outcome_records, consultation_notes, and contact_outcomes.
 * This is a read-only projection; no data is duplicated or modified.
 */
export interface ClinicalJourneyEntryDto {
  id: string;
  eventType: 'ENROLLMENT' | 'CONSULTATION' | 'ACTIVITY';
  date: string | null;
  program: string | null;
  disease: string | null;
  summary: string;
  activityStatus: string | null;
  outcomeName: string | null;
  outcomeCategory: string | null;
  clinicalNotes: string | null;
  remarks: string | null;
  generatedNote: string | null;
  clinicalData: Record<string, unknown> | null;
  recordedBy: string | null;
  callCount: number;
  enrollmentStatus: string | null;
  eventName: string | null;
}

/**
 * The first pending/active worklist activity for a citizen.
 * Used by the Citizens module to determine whether a scheduled consultation
 * exists before offering "Continue" or "Start New" options.
 */
export interface ActiveActivityDto {
  activityId: string;
  eventName: string | null;
  programName: string | null;
}

/**
 * A rich per-activity consultation history entry (16A+).
 * Combines the worklist item, outcome record, and any FINAL consultation note
 * so the workspace history panel can show a clinically meaningful summary.
 */
export interface ConsultationHistoryEntryDto {
  activityId: string;
  eventName: string;
  program: string | null;
  date: string | null;
  activityStatus: string;
  outcomeName: string | null;
  outcomeCategory: string | null;
  /** Free-text clinical notes from the outcome record. */
  clinicalNotes: string | null;
  /** Additional remarks from the outcome record. */
  remarks: string | null;
  /** Username of the worker who saved the outcome. */
  recordedBy: string | null;
  /** Structured clinical field values from the outcome record (key → value). */
  clinicalData: Record<string, unknown> | null;
  /** The FINAL generated note for this activity, if one was saved. */
  generatedNote: string | null;
}
