import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ClinicalFieldDef } from './consultation.types';

/** Raw context row for a teleconsultation, assembled in one join. */
export interface ConsultationContextRow {
  activity_id: string;
  activity_status: string;
  priority: string;
  due_date: Date | null;
  event_id: string | null;
  event_name: string | null;
  sequence: number | null;
  expected_days: number | null;
  outcome_template_id: string | null;
  disease_id: string | null;
  disease_name: string | null;
  program_id: string | null;
  program_name: string | null;
  program_code: string | null;
  enrollment_id: string;
  enrollment_status: string | null;
  assigned_worker: string | null;
  current_event_id: string | null;
  citizen_id: string | null;
  uhid: string | null;
  full_name: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
}

export interface TimelineRow {
  kind: string;
  id: string;
  title: string;
  program: string | null;
  status: string;
  date: Date | null;
  outcome: string | null;
  priority: string | null;
}

/**
 * Data-access layer for the Teleconsultation / Clinical Activity engine. The ONLY
 * place holding SQL for this feature. All statements are parameterised. Writes
 * touch existing tables only (worklist_items, outcome_records, contact_outcomes)
 * — no schema changes are made.
 */
@Injectable()
export class ConsultationRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Full teleconsultation context for an activity, or null when not found. */
  async findContext(activityId: string): Promise<ConsultationContextRow | null> {
    const result = await this.db.query<ConsultationContextRow>(
      `SELECT w.id AS activity_id,
              w.status AS activity_status,
              w.priority AS priority,
              w.due_date AS due_date,
              w.event_id AS event_id,
              ev.name AS event_name,
              ev.sequence AS sequence,
              ev.expected_days AS expected_days,
              ev.outcome_template_id AS outcome_template_id,
              COALESCE(w.disease_id, e.disease_id) AS disease_id,
              d.name AS disease_name,
              p.id AS program_id,
              p.name AS program_name,
              p.code AS program_code,
              e.id AS enrollment_id,
              e.status AS enrollment_status,
              e.assigned_worker AS assigned_worker,
              e.current_event_id AS current_event_id,
              c.id AS citizen_id,
              c.uhid AS uhid,
              c.full_name AS full_name,
              c.age AS age,
              c.gender AS gender,
              c.phone AS phone
       FROM public.worklist_items w
       JOIN public.enrollments e ON e.id = w.enrollment_id
       LEFT JOIN public.events ev ON ev.id = w.event_id
       LEFT JOIN public.diseases d ON d.id = COALESCE(w.disease_id, e.disease_id)
       LEFT JOIN public.programs p ON p.id = COALESCE(w.program_id, e.program_id)
       LEFT JOIN public.citizens c ON c.id = e.citizen_id
       WHERE w.id = $1
       LIMIT 1`,
      [activityId],
    );
    return result.rows[0] ?? null;
  }

  /** The dynamic clinical field definitions from an outcome template. */
  async findTemplate(
    templateId: string,
  ): Promise<{ name: string; fields: ClinicalFieldDef[] } | null> {
    const result = await this.db.query<{ name: string; fields: unknown }>(
      `SELECT name, fields
       FROM public.outcome_templates
       WHERE id = $1 AND is_active = true
       LIMIT 1`,
      [templateId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { name: row.name, fields: ConsultationRepository.normaliseFields(row.fields) };
  }

  /**
   * The configurable outcomes for an event (the worker's selectable consultation
   * outcomes). These drive the Workflow Rules Engine — each maps to a `rules` row.
   */
  async findOutcomeTypes(
    eventId: string,
  ): Promise<{ id: string; code: string; name: string; category: string }[]> {
    const result = await this.db.query<{
      id: string;
      code: string;
      name: string;
      category: string;
    }>(
      `SELECT id, code, name, category
       FROM public.outcome_types
       WHERE event_id = $1
       ORDER BY
         CASE category WHEN 'POSITIVE' THEN 0 WHEN 'NEUTRAL' THEN 1
                       WHEN 'NEGATIVE' THEN 2 WHEN 'ESCALATION' THEN 3 ELSE 4 END,
         name`,
      [eventId],
    );
    return result.rows;
  }

  /** Resolves one outcome type (validates the worker's selection), or null. */
  async findOutcomeType(
    outcomeTypeId: string,
  ): Promise<{ id: string; code: string; name: string; category: string; event_id: string } | null> {
    const result = await this.db.query<{
      id: string;
      code: string;
      name: string;
      category: string;
      event_id: string;
    }>(
      `SELECT id, code, name, category, event_id
       FROM public.outcome_types WHERE id = $1 LIMIT 1`,
      [outcomeTypeId],
    );
    return result.rows[0] ?? null;
  }

  /** Next call attempt number for an activity (1-based). */
  async nextAttemptNumber(activityId: string): Promise<number> {
    const result = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.contact_outcomes WHERE worklist_item_id = $1`,
      [activityId],
    );
    return (result.rows[0]?.n ?? 0) + 1;
  }

  /** Logs a contact attempt against the activity. */
  async insertContactOutcome(input: {
    activityId: string;
    contactType: string;
    attemptNumber: number;
    notes: string | null;
    contactedBy: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO public.contact_outcomes
         (worklist_item_id, contact_type, attempt_number, notes, contacted_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.activityId, input.contactType, input.attemptNumber, input.notes, input.contactedBy],
    );
  }

  /** Stores the clinical observation/outcome record; returns its id. */
  async insertOutcomeRecord(input: {
    activityId: string;
    templateId: string;
    outcomeTypeId: string;
    data: unknown;
    recordedBy: string | null;
  }): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO public.outcome_records
         (worklist_item_id, template_id, outcome_type_id, data, recorded_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id`,
      [
        input.activityId,
        input.templateId,
        input.outcomeTypeId,
        JSON.stringify(input.data ?? {}),
        input.recordedBy,
      ],
    );
    return result.rows[0].id;
  }

  /**
   * Activity lifecycle writes (status transitions, retries, scheduling) are NOT
   * performed here — they belong to the Activity module and are orchestrated by
   * the Workflow Rules Engine. This repository only records the consultation
   * (outcome_records + contact_outcomes) and reads context/timeline.
   */

  /** A patient's chronological journey: enrollments and their activities. */
  async findTimeline(citizenId: string): Promise<TimelineRow[]> {
    const result = await this.db.query<TimelineRow>(
      `SELECT * FROM (
         SELECT 'ENROLLMENT'::text AS kind,
                e.id::text AS id,
                COALESCE(p.name, 'Enrollment') AS title,
                p.name AS program,
                e.status AS status,
                COALESCE(e.start_date::timestamptz, e.created_at) AS date,
                NULL::text AS outcome,
                NULL::text AS priority,
                e.created_at AS sort_at
           FROM public.enrollments e
           LEFT JOIN public.programs p ON p.id = e.program_id
           WHERE e.citizen_id = $1
         UNION ALL
         SELECT 'ACTIVITY'::text AS kind,
                w.id::text AS id,
                COALESCE(ev.name, 'Activity') AS title,
                p.name AS program,
                w.status AS status,
                COALESCE(w.outcome_recorded_at, w.due_date::timestamptz, w.created_at) AS date,
                (
                  SELECT COALESCE(orr.data ->> 'outcomeName', orr.data ->> 'consultationStatus')
                  FROM public.outcome_records orr
                  WHERE orr.worklist_item_id = w.id
                  ORDER BY orr.recorded_at DESC
                  LIMIT 1
                ) AS outcome,
                w.priority AS priority,
                w.created_at AS sort_at
           FROM public.worklist_items w
           JOIN public.enrollments e ON e.id = w.enrollment_id
           LEFT JOIN public.events ev ON ev.id = w.event_id
           LEFT JOIN public.programs p ON p.id = COALESCE(w.program_id, e.program_id)
           WHERE e.citizen_id = $1
       ) feed
       ORDER BY date ASC NULLS LAST, sort_at ASC
       LIMIT 200`,
      [citizenId],
    );
    return result.rows;
  }

  /** Normalises template fields jsonb into typed defs (tolerant of variants). */
  private static normaliseFields(raw: unknown): ClinicalFieldDef[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((f, i) => {
        const obj = (f ?? {}) as Record<string, unknown>;
        return {
          type: typeof obj.type === 'string' ? obj.type : 'text',
          label: typeof obj.label === 'string' ? obj.label : `Field ${i + 1}`,
          options: Array.isArray(obj.options)
            ? obj.options.filter((o): o is string => typeof o === 'string')
            : [],
          required: obj.required === true,
          sortOrder: typeof obj.sort_order === 'number' ? obj.sort_order : i,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
}
