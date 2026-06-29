import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityService } from '../activity/activity.service';
import { GuidebooksService } from '../guidebooks/guidebooks.service';
import { WorkflowEngine } from '../workflow/workflow.engine';
import {
  ConsultationContextRow,
  ConsultationRepository,
} from './consultation.repository';
import { SaveConsultationDto } from './dto/save-consultation.dto';
import {
  ConsultationContextDto,
  SaveConsultationResultDto,
  StartCallResultDto,
  TimelineEntryDto,
} from './consultation.types';

/**
 * Teleconsultation surface. It gathers the consultation context, records the
 * chosen outcome and the clinical observations, and then DELEGATES every workflow
 * decision to the Workflow Rules Engine.
 *
 * Deliberately contains NO workflow logic: there is no `if (outcome === '...')`,
 * no next-activity scheduling and no lifecycle branching here. What happens after
 * an outcome is entirely database-driven via the engine + the `rules` table.
 */
@Injectable()
export class ConsultationService {
  constructor(
    private readonly repo: ConsultationRepository,
    private readonly activities: ActivityService,
    private readonly guidebooks: GuidebooksService,
    private readonly workflow: WorkflowEngine,
  ) {}

  /** Builds the full teleconsultation context for an activity. */
  async getContext(activityId: string): Promise<ConsultationContextDto> {
    const row = await this.requireContext(activityId);

    const [activity, guidebook, template, outcomeTypes] = await Promise.all([
      this.activities.getById(activityId),
      this.guidebooks.matchByText(ConsultationService.haystack(row)),
      row.outcome_template_id
        ? this.repo.findTemplate(row.outcome_template_id)
        : Promise.resolve(null),
      row.event_id ? this.repo.findOutcomeTypes(row.event_id) : Promise.resolve([]),
    ]);

    if (!activity) {
      throw new NotFoundException('Activity not found.');
    }

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
      // Outcomes are sourced from the event's outcome_types — fully data-driven.
      outcomeOptions: outcomeTypes,
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
    // Lifecycle transition is owned by the Activity module (reused, not duplicated).
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
   */
  async save(
    activityId: string,
    dto: SaveConsultationDto,
    user: string | null,
  ): Promise<SaveConsultationResultDto> {
    const row = await this.requireContext(activityId);

    // Validate the chosen outcome belongs to this activity's event.
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

    // 2) Log the call result alongside the attempt history.
    const attemptNumber = await this.repo.nextAttemptNumber(activityId);
    await this.repo.insertContactOutcome({
      activityId,
      contactType: 'TELECONSULT',
      attemptNumber,
      notes: dto.clinicalNotes?.trim() || outcome.name,
      contactedBy: user,
    });

    // 3) Hand off ALL workflow decisions to the Workflow Rules Engine.
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

  private async requireContext(activityId: string): Promise<ConsultationContextRow> {
    const row = await this.repo.findContext(activityId);
    if (!row) {
      throw new NotFoundException('Activity not found.');
    }
    return row;
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
