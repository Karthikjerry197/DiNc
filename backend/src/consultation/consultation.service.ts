import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActivityService } from '../activity/activity.service';
import { CdseService } from '../cdse/cdse.service';
import { GuidebooksService } from '../guidebooks/guidebooks.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import {
  ConsultationContextRow,
  ConsultationRepository,
  OutcomeResponseInput,
  TemplateFieldRow,
} from './consultation.repository';
import { SaveConsultationDto } from './dto/save-consultation.dto';
import {
  ActiveActivityDto,
  ClinicalJourneyEntryDto,
  ConsultationContextDto,
  ConsultationHistoryEntryDto,
  ConsultationNoteDto,
  ConsultationResponseInput,
  SaveConsultationResultDto,
  StartCallResultDto,
  TimelineEntryDto,
} from './consultation.types';
import type { GuidebookDetail } from '../guidebooks/guidebooks.types';

/**
 * Consultation & Outcome Engine (Step 7 — metadata-driven).
 *
 * Gathers the consultation context from dinc_metadata/dinc_runtime, records the
 * phone interaction (dinc_runtime.call_log) and the clinical observations
 * (dinc_runtime.outcome_response), then lets the METADATA decide what follows:
 *
 *  - the programme's resolved call-outcome rule (v_call_outcome_rule_resolved)
 *    decides whether a follow-up task is raised (CREATE_FOLLOWUP) — created in
 *    the same transaction as the call log;
 *  - the template field's `workflow_action` (COMPLETE_ACTIVITY) decides whether
 *    the current activity_instance completes — executed through the EXISTING
 *    Step-6A lifecycle (ActivityService.completeActivityInstance: next-activity
 *    activation, event completion, dependent-event activation), followed by one
 *    Step-6B scheduler sweep (recurring streams, seeding, overdue follow-ups).
 *
 * No workflow logic is duplicated here: there is no `if (outcome === '...')`
 * branching — every decision is a metadata lookup. The legacy WorkflowEngine
 * dependency is gone (its own migration is Step 8).
 */
@Injectable()
export class ConsultationService {
  private readonly logger = new Logger(ConsultationService.name);

  constructor(
    private readonly repo: ConsultationRepository,
    private readonly activities: ActivityService,
    private readonly cdse: CdseService,
    private readonly guidebooks: GuidebooksService,
    private readonly scheduler: SchedulerService,
  ) {}

  /** Builds the full teleconsultation context for an event instance. */
  async getContext(activityId: string): Promise<ConsultationContextDto> {
    const row = await this.requireContext(activityId);

    const [activity, guidebook, template, outcomeOptions, previousNote] = await Promise.all([
      this.activities.getById(activityId),
      this.resolveGuidebook(row),
      row.current_activity_id
        ? this.repo.findTemplateForActivity(row.current_activity_id)
        : Promise.resolve(null),
      row.event_code ? this.repo.findOutcomeOptions(row.event_code) : Promise.resolve([]),
      this.repo.findLatestDraftNote(activityId),
    ]);

    if (!activity) {
      throw new NotFoundException('Activity not found.');
    }

    // Fetch counselling sections only after we know which guidebook applies.
    const counsellingSections = guidebook
      ? await this.repo.findCounsellingSections(guidebook.id).catch(() => [])
      : [];

    return {
      activity,
      patient: {
        citizenId: row.citizen_id,
        uhid: row.uhid,
        fullName: row.full_name,
        age: row.age,
        gender: row.gender,
        phone: row.phone,
        assignedWorker: row.assigned_worker,
      },
      clinicalContext: {
        program: row.program_name,
        activity: row.event_name,
        enrollmentStatus: row.enrollment_status,
        enrollmentId: row.enrollment_id,
        condition: row.disease_name,
      },
      dial: ConsultationService.dial(row.phone),
      guidebook,
      clinicalForm: {
        templateId: template?.templateId ?? null,
        templateName: template?.name ?? null,
        fields: template ? ConsultationRepository.toClinicalFieldDefs(template.fields) : [],
      },
      outcomeOptions,
      previousNote,
      counsellingSections,
    };
  }

  /**
   * Starts a call: returns the dial hand-off and the attempt number (existing
   * call_log count + 1). Nothing is recorded yet — dinc_runtime.call_log
   * requires an outcome, which only exists once the consultation is saved.
   * (The legacy IN_PROGRESS transition is gone: event_instance has no such
   * state — LOCKED/ACTIVE/COMPLETED per the runtime CHECK constraints.)
   */
  async startCall(activityId: string, user: string | null): Promise<StartCallResultDto> {
    void user;
    const row = await this.requireContext(activityId);
    const attemptNumber = await this.repo.nextAttemptNumber(activityId);

    const activity = await this.activities.getById(activityId);
    if (!activity) throw new NotFoundException('Activity not found.');
    return { activity, dial: ConsultationService.dial(row.phone), attemptNumber };
  }

  /**
   * Saves the consultation — the Step-7 metadata-driven recording path:
   *
   *  1. One transaction (repo.saveConsultation): call_log + outcome_response
   *     rows + (when the outcome rule says CREATE_FOLLOWUP) the followup_task.
   *  2. Supplementary artefacts that must never roll back the clinical record:
   *     the FINAL note and the counselling consultation_responses (dinc_app),
   *     now keyed by the call_log id.
   *  3. CDSE classification — non-blocking, unchanged.
   *  4. Lifecycle: when an answered field carries workflow_action
   *     COMPLETE_ACTIVITY with a truthy value, the current activity_instance is
   *     completed via the existing Step-6A path, then one Step-6B scheduler
   *     cycle materialises whatever the schedule metadata implies next.
   */
  async save(
    activityId: string,
    dto: SaveConsultationDto,
    user: string | null,
  ): Promise<SaveConsultationResultDto> {
    const row = await this.requireContext(activityId);

    // Validate the outcome against the metadata: it must exist and be offered
    // for this event (v_event_call_outcome_resolved).
    const outcome = await this.repo.findOutcomeByCode(dto.outcomeTypeId);
    const offered = row.event_code
      ? await this.repo.findOutcomeOptions(row.event_code)
      : [];
    if (!outcome || !offered.some((o) => o.code === outcome.code)) {
      throw new NotFoundException('Selected outcome does not apply to this activity.');
    }

    // Resolve the programme's call-outcome rule (metadata decides the follow-up).
    const rule = row.program_code
      ? await this.repo.findOutcomeRule(row.program_code, outcome.code)
      : null;

    // Match submitted clinicalData onto the current activity's template fields.
    const template = row.current_activity_id
      ? await this.repo.findTemplateForActivity(row.current_activity_id)
      : null;
    const { responses, completeActivity } = ConsultationService.matchResponses(
      template?.fields ?? [],
      dto.clinicalData ?? {},
    );

    // 1) The atomic clinical record: call log + responses + rule-driven follow-up.
    const saved = await this.repo.saveConsultation({
      enrolmentId: row.enrollment_id,
      eventInstanceId: activityId,
      activityInstanceId: row.current_activity_instance_id,
      outcomeCode: outcome.code,
      notes: dto.clinicalNotes?.trim() || null,
      recordedByUsername: user,
      responses,
      followup:
        rule?.next_action === 'CREATE_FOLLOWUP'
          ? { delayDays: rule.followup_delay_days ?? 7, priority: rule.priority ?? 'NORMAL' }
          : null,
      assignedTo: row.assigned_to,
    });

    // 2) Supplementary: FINAL note (never rolls back the clinical record).
    if (dto.generatedNote?.trim()) {
      await this.repo
        .insertFinalNote(activityId, dto.generatedNote.trim(), saved.callLogId, user)
        .catch(() => undefined);
    }

    // 2b) Supplementary: explicit counselling responses (dinc_app), keyed by the
    //     call_log id (the consultation record identity since Step 7).
    if (row.citizen_id) {
      try {
        const written = await this.repo.persistConsultationResponses({
          outcomeRecordId: saved.callLogId,
          activityId,
          citizenId: row.citizen_id,
          responses: ConsultationService.toConsultationResponses(dto),
          recordedBy: user,
        });
        if (written > 0) {
          this.logger.log(
            `Persisted ${written} consultation_response(s) for event instance ${activityId}`,
          );
        }
      } catch (err) {
        this.logger.error(
          `consultation_responses persistence failed for ${activityId}`,
          (err as Error).message,
        );
      }
    }

    // 3) CDSE classification — non-blocking, never fails the save.
    void this.cdse.classifyAfterConsultation(
      activityId,
      dto.checkedItemIds ?? [],
      dto.counsellingItemIds ?? [],
    );

    // 4) Lifecycle via the EXISTING engines (no duplicated logic): Step-6A
    //    completion, then one Step-6B scheduler sweep.
    let nextActivityEventInstanceId: string | null = null;
    let eventCompleted = false;
    if (completeActivity && row.current_activity_instance_id) {
      try {
        const completion = await this.activities.completeActivityInstance(
          row.current_activity_instance_id,
        );
        eventCompleted = completion.eventCompleted;
        nextActivityEventInstanceId =
          completion.activatedEvents[0]?.eventInstanceId ?? null;
      } catch (err) {
        this.logger.error(
          `Activity completion after consultation failed: ${(err as Error).message}`,
        );
      }
      await this.scheduler
        .runCycle('AUTO')
        .catch((err) =>
          this.logger.error(`Post-consultation scheduler cycle failed: ${(err as Error).message}`),
        );
    }

    const [activity, nextActivity] = await Promise.all([
      this.activities.getById(activityId),
      nextActivityEventInstanceId
        ? this.activities.getById(nextActivityEventInstanceId)
        : Promise.resolve(null),
    ]);
    if (!activity) throw new NotFoundException('Activity not found.');

    const workflowAction =
      rule?.next_action ?? (completeActivity ? 'COMPLETE_ACTIVITY' : 'NONE');
    return {
      activity,
      nextActivity,
      enrollmentStatus: row.enrollment_status,
      outcomeRecordId: saved.callLogId,
      workflowAction,
      workflowMessage: ConsultationService.workflowMessage(
        outcome.name,
        workflowAction,
        saved.followupTaskId !== null,
        completeActivity,
        eventCompleted,
      ),
      escalated: outcome.category === 'ESCALATION' || rule?.priority === 'URGENT',
    };
  }

  /** Upserts a DRAFT consultation note for auto-save from the workspace. */
  async upsertDraftNote(
    activityId: string,
    generatedNote: string,
    user: string | null,
  ): Promise<ConsultationNoteDto> {
    await this.requireContext(activityId);
    return this.repo.upsertDraftNote(activityId, generatedNote, user);
  }

  /** Returns the current DRAFT note for an activity, or null. */
  async getConsultationNote(activityId: string): Promise<ConsultationNoteDto | null> {
    await this.requireContext(activityId);
    return this.repo.findLatestDraftNote(activityId);
  }

  /**
   * Returns the full Clinical Journey for a citizen: enrolments, event
   * instances, and completed consultations, newest first. Read-only aggregation;
   * no records are created, copied, or modified.
   */
  async getClinicalJourney(citizenId: string): Promise<ClinicalJourneyEntryDto[]> {
    return this.repo.findClinicalJourney(citizenId);
  }

  /** Enriched per-activity consultation history for the history panel. */
  async getConsultationHistory(citizenId: string): Promise<ConsultationHistoryEntryDto[]> {
    return this.repo.findConsultationHistory(citizenId);
  }

  /**
   * Returns the first ACTIVE event instance for a citizen, or null when no
   * scheduled consultation exists.
   */
  async getActiveActivity(citizenId: string): Promise<ActiveActivityDto | null> {
    const row = await this.repo.findActiveActivity(citizenId);
    if (!row) return null;
    return {
      activityId: row.activity_id,
      eventName: row.event_name,
      programName: row.program_name,
    };
  }

  /** Builds the patient's chronological timeline. */
  async getTimeline(citizenId: string): Promise<TimelineEntryDto[]> {
    const rows = await this.repo.findTimeline(citizenId);
    return rows.map((row) => ({
      kind:
        row.kind === 'ENROLLMENT' || row.kind === 'COMPLETION'
          ? (row.kind as 'ENROLLMENT' | 'COMPLETION')
          : 'ACTIVITY',
      id: row.id,
      title: row.title,
      program: row.program,
      status: row.status,
      date: row.date ? new Date(row.date).toISOString() : null,
      outcome: row.outcome,
      priority: row.priority,
    }));
  }

  /**
   * Matches the submitted clinicalData object onto the template's fields by
   * field_name (falling back to field_label), producing the outcome_response
   * inputs. Also evaluates the metadata `workflow_action`: an answered
   * COMPLETE_ACTIVITY field with a truthy value marks the activity complete.
   */
  private static matchResponses(
    fields: TemplateFieldRow[],
    clinicalData: Record<string, unknown>,
  ): { responses: OutcomeResponseInput[]; completeActivity: boolean } {
    const responses: OutcomeResponseInput[] = [];
    let completeActivity = false;
    for (const f of fields) {
      const raw =
        clinicalData[f.field_name] !== undefined
          ? clinicalData[f.field_name]
          : clinicalData[f.field_label];
      if (raw === undefined || raw === null || raw === '') continue;
      const value = typeof raw === 'string' ? raw : JSON.stringify(raw);
      responses.push({ fieldId: f.field_id, value });
      if (
        f.workflow_action === 'COMPLETE_ACTIVITY' &&
        ConsultationService.isTruthy(raw)
      ) {
        completeActivity = true;
      }
    }
    return { responses, completeActivity };
  }

  private static isTruthy(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      return ['true', 'yes', 'y', '1', 'completed'].includes(value.trim().toLowerCase());
    }
    return false;
  }

  private static workflowMessage(
    outcomeName: string,
    action: string,
    followupCreated: boolean,
    completedActivity: boolean,
    eventCompleted: boolean,
  ): string {
    const parts = [`Outcome "${outcomeName}" recorded.`];
    if (completedActivity) {
      parts.push(eventCompleted ? 'Event completed.' : 'Activity completed.');
    }
    if (followupCreated) parts.push('Follow-up task created.');
    else if (action === 'FOLLOW_PROGRAM_SCHEDULE') parts.push('Programme schedule continues.');
    return parts.join(' ');
  }

  /**
   * UI adapter (Milestone 25A). Translates the checkbox questionnaire —
   * `counsellingItemIds` (all displayed) + `checkedItemIds` (confirmed) — into
   * the abstract ConsultationResponseInput model the persistence layer consumes.
   */
  private static toConsultationResponses(
    dto: SaveConsultationDto,
  ): ConsultationResponseInput[] {
    const checked = new Set(dto.checkedItemIds ?? []);
    const displayed = [
      ...new Set([...(dto.counsellingItemIds ?? []), ...(dto.checkedItemIds ?? [])]),
    ];
    return displayed.map((counsellingItemId) => {
      const answered = checked.has(counsellingItemId);
      return {
        counsellingItemId,
        responseStatus: answered ? 'ANSWERED' : 'NOT_ASSESSED',
        responseValue: answered ? 'YES' : null,
      };
    });
  }

  private async requireContext(activityId: string): Promise<ConsultationContextRow> {
    const row = await this.repo.findContext(activityId);
    if (!row) {
      throw new NotFoundException('Activity not found.');
    }
    return row;
  }

  /**
   * Resolves the guidebook for a consultation context. Guidebook reads are
   * still on legacy tables (their migration is Step 9) — resolution degrades to
   * null instead of failing the whole context when unavailable.
   */
  private async resolveGuidebook(row: ConsultationContextRow): Promise<GuidebookDetail | null> {
    try {
      const ref = await this.guidebooks.matchByText(ConsultationService.haystack(row));
      if (!ref) return null;
      // includeCounselling=false: the workspace renders counselling content
      // interactively through the wizard (findCounsellingSections).
      return await this.guidebooks.detail(ref.id, false);
    } catch {
      return null;
    }
  }

  /** Clinical-context text for guidebook resolution (reuses the matcher). */
  private static haystack(row: ConsultationContextRow): string {
    return [row.program_name, row.program_code, row.disease_name, row.event_name]
      .filter(Boolean)
      .join(' ');
  }

  private static dial(phone: string | null): {
    phone: string | null;
    telLink: string | null;
    provider: 'tel';
  } {
    const trimmed = phone?.trim() || null;
    return {
      phone: trimmed,
      telLink: trimmed ? `tel:${trimmed.replace(/[^+\d]/g, '')}` : null,
      provider: 'tel',
    };
  }
}
