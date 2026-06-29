/**
 * Types for the Teleconsultation surface.
 *
 * Workflow decisions are NOT made here. The consultation module only gathers the
 * context, records the chosen outcome and the clinical observations, then hands
 * off to the Workflow Rules Engine. The selectable outcomes come from the event's
 * `outcome_types` (database-driven), and the clinical form from the event's
 * `outcome_templates` row — so any CPHC program is supported without code changes.
 */
import type { GuidebookRef } from '../guidebooks/guidebooks.types';
import type { ActivityDto } from '../activity/activity.types';

/** A single dynamic clinical field as stored in outcome_templates.fields. */
export interface ClinicalFieldDef {
  type: 'text' | 'longtext' | 'number' | 'dropdown' | 'radio' | string;
  label: string;
  options: string[];
  required: boolean;
  sortOrder: number;
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

/** Everything the Teleconsultation window + outcome form need, in one payload. */
export interface ConsultationContextDto {
  activity: ActivityDto;
  patient: PatientInfo;
  clinicalContext: ClinicalContext;
  dial: DialInfo;
  guidebook: GuidebookRef | null;
  /** Dynamic, program-specific clinical fields (from the event's template). */
  clinicalForm: {
    templateId: string | null;
    templateName: string | null;
    fields: ClinicalFieldDef[];
  };
  /** Configurable outcomes for this event (drives the workflow rules engine). */
  outcomeOptions: OutcomeOption[];
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
