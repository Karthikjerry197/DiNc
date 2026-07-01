import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActivityService } from '../activity/activity.service';
import { CdseService } from '../cdse/cdse.service';
import { GuidebooksService } from '../guidebooks/guidebooks.service';
import { WorkflowEngine } from '../workflow/workflow.engine';
import {
  ConsultationContextRow,
  ConsultationRepository,
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
 * Teleconsultation surface. It gathers the consultation context, records the
 * chosen outcome and the clinical observations, and then DELEGATES every workflow
 * decision to the Workflow Rules Engine.
 *
 * Deliberately contains NO workflow logic: there is no `if (outcome === '...')`,
 * no next-activity scheduling and no lifecycle branching here. What happens after
 * an outcome is entirely database-driven via the engine + the `rules` table.
 *
 * 16A additions:
 * - Guidebook resolution via guide_rules regex matching (program + disease + event).
 * - Returns full GuidebookDetail (with sections) instead of GuidebookRef.
 * - Loads any existing DRAFT note and returns it as `previousNote`.
 * - Persists consultation note alongside the saved outcome record.
 */
@Injectable()
export class ConsultationService {
  private readonly logger = new Logger(ConsultationService.name);

  constructor(
    private readonly repo: ConsultationRepository,
    private readonly activities: ActivityService,
    private readonly cdse: CdseService,
    private readonly guidebooks: GuidebooksService,
    private readonly workflow: WorkflowEngine,
  ) {}

  /** Builds the full teleconsultation context for an activity. */
  async getContext(activityId: string): Promise<ConsultationContextDto> {
    const row = await this.requireContext(activityId);

    const [activity, guidebook, template, outcomeTypes, previousNote] = await Promise.all([
      this.activities.getById(activityId),
      this.resolveGuidebook(row),
      row.outcome_template_id
        ? this.repo.findTemplate(row.outcome_template_id)
        : Promise.resolve(null),
      row.event_id ? this.repo.findOutcomeTypes(row.event_id) : Promise.resolve([]),
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
        templateId: row.outcome_template_id,
        templateName: template?.name ?? null,
        fields: template?.fields ?? [],
      },
      outcomeOptions: outcomeTypes,
      previousNote,
      counsellingSections,
    };
  }

  /**
   * Starts a call: logs the attempt and moves the activity to IN_PROGRESS so the
   * worklist/dashboard reflect the live consultation. Returns the dial hand-off
   * (a tel: link today; structured for future VOIP).
   */
  async startCall(activityId: string, user: string | null): Promise<StartCallResultDto> {
    const row = await this.requireContext(activityId);

    const attemptNumber = await this.repo.nextAttemptNumber(activityId);
    await this.repo.insertContactOutcome({
      activityId,
      contactType: 'TELECONSULT',
      attemptNumber,
      notes: 'Call initiated',
      contactedBy: user,
    });
    await this.activities.transition(activityId, 'IN_PROGRESS');

    const activity = await this.activities.getById(activityId);
    if (!activity) throw new NotFoundException('Activity not found.');
    return { activity, dial: ConsultationService.dial(row.phone), attemptNumber };
  }

  /**
   * Saves the consultation: persists the clinical observations + the selected
   * outcome, then hands off to the Workflow Rules Engine which decides and applies
   * everything that follows (status change, next activity, retry, referral,
   * escalation, notifications).
   *
   * 16A: if `dto.generatedNote` is present, a FINAL consultation note is inserted
   * linked to the outcome record. This is supplementary — note failure does not
   * roll back the clinical record.
   */
  async save(
    activityId: string,
    dto: SaveConsultationDto,
    user: string | null,
  ): Promise<SaveConsultationResultDto> {
    const row = await this.requireContext(activityId);

    const outcome = await this.repo.findOutcomeType(dto.outcomeTypeId);
    if (!outcome || (row.event_id && outcome.event_id !== row.event_id)) {
      throw new NotFoundException('Selected outcome does not apply to this activity.');
    }

    // 1) Persist the clinical record first (never lose documentation).
    let outcomeRecordId = '';
    if (row.outcome_template_id) {
      outcomeRecordId = await this.repo.insertOutcomeRecord({
        activityId,
        templateId: row.outcome_template_id,
        outcomeTypeId: outcome.id,
        data: {
          outcomeTypeId: outcome.id,
          outcomeCode: outcome.code,
          outcomeName: outcome.name,
          outcomeCategory: outcome.category,
          clinicalNotes: dto.clinicalNotes?.trim() || null,
          remarks: dto.remarks?.trim() || null,
          fields: dto.clinicalData ?? {},
          recordedBy: user,
        },
        recordedBy: user,
      });
    }

    // 2) Persist the generated note as FINAL (if provided by the workspace).
    if (dto.generatedNote?.trim() && outcomeRecordId) {
      await this.repo.insertFinalNote(
        activityId,
        dto.generatedNote.trim(),
        outcomeRecordId,
        user,
      ).catch(() => {
        // Note persistence is supplementary: a failure must not roll back the
        // clinical outcome record which is the authoritative clinical record.
      });
    }

    // 2b) Persist explicit consultation_responses — the single source of truth
    //     (Milestone 25A, Step 2). One row per DISPLAYED counselling question
    //     (ANSWERED / NOT_ASSESSED). Supplementary to the outcome record: a
    //     failure must never roll back the authoritative clinical record, and it
    //     runs ALONGSIDE the existing checkedItemIds dual-read (CDSE unchanged).
    if (outcomeRecordId && row.citizen_id) {
      try {
        const written = await this.repo.persistConsultationResponses({
          outcomeRecordId,
          activityId,
          citizenId: row.citizen_id,
          responses: ConsultationService.toConsultationResponses(dto),
          recordedBy: user,
        });
        this.logger.log(
          `[25A] Persisted ${written} consultation_response(s) for activity ${activityId}`,
        );
      } catch (err) {
        this.logger.error(
          `[25A] consultation_responses persistence failed for activity ${activityId}`,
          (err as Error).message,
        );
      }
    }

    // 3) Log the call result alongside the attempt history.
    const attemptNumber = await this.repo.nextAttemptNumber(activityId);
    await this.repo.insertContactOutcome({
      activityId,
      contactType: 'TELECONSULT',
      attemptNumber,
      notes: dto.clinicalNotes?.trim() || outcome.name,
      contactedBy: user,
    });

    // 4) Trigger CDSE classification — non-blocking, never fails the save.
    void this.cdse.classifyAfterConsultation(
      activityId,
      dto.checkedItemIds ?? [],
      dto.counsellingItemIds ?? [],
    );

    // 5) Hand off ALL workflow decisions to the Workflow Rules Engine.
    const execution = await this.workflow.execute({
      activityId,
      enrollmentId: row.enrollment_id,
      programId: row.program_id,
      diseaseId: row.disease_id,
      eventId: row.event_id,
      outcomeTypeId: outcome.id,
      outcomeCategory: outcome.category,
      recordedBy: user,
    });

    const [activity, nextActivity] = await Promise.all([
      this.activities.getById(activityId),
      execution.nextActivityId
        ? this.activities.getById(execution.nextActivityId)
        : Promise.resolve(null),
    ]);
    if (!activity) throw new NotFoundException('Activity not found.');

    return {
      activity,
      nextActivity,
      enrollmentStatus: execution.enrollmentStatus ?? row.enrollment_status,
      outcomeRecordId,
      workflowAction: execution.action,
      workflowMessage: execution.message,
      escalated: execution.escalated,
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
   * Returns the full Clinical Journey for a citizen: enrollments, activities,
   * and completed consultations, newest first. Read-only aggregation over
   * existing tables; no records are created, copied, or modified.
   */
  async getClinicalJourney(citizenId: string): Promise<ClinicalJourneyEntryDto[]> {
    return this.repo.findClinicalJourney(citizenId);
  }

  /**
   * Returns enriched per-activity consultation history for the history panel.
   * Additive — does not affect the existing timeline endpoint.
   */
  async getConsultationHistory(citizenId: string): Promise<ConsultationHistoryEntryDto[]> {
    return this.repo.findConsultationHistory(citizenId);
  }

  /**
   * Returns the first pending/active worklist activity for a citizen, or null
   * when no scheduled consultation exists. Used by the Citizens module to
   * determine whether to show the "Continue Scheduled" or "Start New" dialog.
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
      kind: row.kind === 'ENROLLMENT' ? 'ENROLLMENT' : 'ACTIVITY',
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
   * UI adapter (Milestone 25A). Translates the current checkbox questionnaire —
   * `counsellingItemIds` (all displayed) + `checkedItemIds` (confirmed) — into the
   * abstract, response-type-agnostic ConsultationResponseInput model the
   * persistence layer consumes. This is the ONLY place the "checked ⇒ 'YES'"
   * convention lives; the API contract and frontend behaviour are unchanged.
   * When richer response types arrive, only this adapter changes.
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
   * Resolves the guidebook for a consultation context using the existing
   * guide_rules table: each rule holds a regex pattern; the first rule whose
   * pattern matches the clinical context text (program + code + disease + event)
   * wins. Returns full GuidebookDetail (with sections), or null when no rule
   * matches.
   */
  private async resolveGuidebook(row: ConsultationContextRow): Promise<GuidebookDetail | null> {
    const ref = await this.guidebooks.matchByText(ConsultationService.haystack(row));
    if (!ref) return null;
    return this.guidebooks.detail(ref.id);
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
