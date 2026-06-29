import { Injectable, Logger } from '@nestjs/common';
import { ActivityService } from '../activity/activity.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { WorkflowRepository } from './workflow.repository';
import {
  RetryPolicy,
  RuleConditions,
  RuleRow,
  WorkflowAction,
  WorkflowContext,
  WorkflowExecutionResult,
} from './workflow.types';

/**
 * The Workflow Rules Engine — the SINGLE place responsible for deciding and
 * executing what happens after a consultation outcome.
 *
 * It receives a {@link WorkflowContext} (program/event/outcome + the activity it
 * belongs to), looks up the matching `rules` row, resolves the configured
 * {@link WorkflowAction}, and executes it by reusing the Activity and Enrollment
 * services. Retry behaviour is driven by `retry_config`. There is no
 * `if (outcome === '...')` anywhere — the action comes entirely from the database.
 */
@Injectable()
export class WorkflowEngine {
  private readonly logger = new Logger(WorkflowEngine.name);

  /** Fallback action by outcome category when a rule has no explicit action. */
  private static readonly DEFAULT_ACTION: Record<string, WorkflowAction> = {
    POSITIVE: WorkflowAction.COMPLETE_AND_ADVANCE,
    NEUTRAL: WorkflowAction.RETRY_ACTIVITY,
    NEGATIVE: WorkflowAction.RETRY_ACTIVITY,
    ESCALATION: WorkflowAction.ESCALATE,
  };

  constructor(
    private readonly repo: WorkflowRepository,
    private readonly activities: ActivityService,
    private readonly enrollments: EnrollmentService,
  ) {}

  /**
   * Resolves and executes the workflow rule for a consultation outcome. Always
   * resolves to a concrete action (rule → category default → COMPLETE_AND_ADVANCE)
   * so the engine never leaves an activity in limbo.
   */
  async execute(ctx: WorkflowContext): Promise<WorkflowExecutionResult> {
    const rule = await this.repo.findRuleByOutcomeType(ctx.outcomeTypeId);
    const conditions: RuleConditions = rule?.conditions ?? {};
    const action = this.resolveAction(conditions, ctx.outcomeCategory);
    const retry = await this.repo.findRetryPolicy(ctx.programId, ctx.diseaseId);

    try {
      switch (action) {
        case WorkflowAction.COMPLETE_AND_ADVANCE:
          return await this.completeAndAdvance(ctx, rule, true);
        case WorkflowAction.CREATE_ACTIVITY:
          return await this.completeAndAdvance(ctx, rule, false);
        case WorkflowAction.RETRY_ACTIVITY:
          return await this.retry(ctx, conditions, retry);
        case WorkflowAction.RESCHEDULE_ACTIVITY:
          return await this.reschedule(ctx, rule);
        case WorkflowAction.CREATE_REFERRAL:
          return await this.createReferral(ctx, rule, conditions);
        case WorkflowAction.HOLD_PROGRAM:
          return await this.holdOrClose(ctx, WorkflowAction.HOLD_PROGRAM);
        case WorkflowAction.CLOSE_PROGRAM:
          return await this.holdOrClose(ctx, WorkflowAction.CLOSE_PROGRAM);
        case WorkflowAction.ESCALATE:
          return await this.escalate(ctx, conditions);
        case WorkflowAction.SEND_NOTIFICATION:
          return await this.sendNotification(ctx, conditions);
        default:
          return await this.completeAndAdvance(ctx, rule, true);
      }
    } catch (error) {
      // The outcome record is already persisted by the caller; surface a clear
      // result rather than failing the whole save.
      this.logger.error(
        `Workflow action ${action} failed for activity ${ctx.activityId}: ${(error as Error).message}`,
      );
      return {
        action,
        message: `Outcome saved, but the workflow action could not be completed.`,
        nextActivityId: null,
        enrollmentStatus: null,
        escalated: false,
        notified: false,
        attempt: null,
      };
    }
  }

  private resolveAction(
    conditions: RuleConditions,
    category: string | null,
  ): WorkflowAction {
    const configured = conditions.action;
    if (configured && WorkflowEngine.isAction(configured)) {
      return configured as WorkflowAction;
    }
    return (
      WorkflowEngine.DEFAULT_ACTION[(category ?? '').toUpperCase()] ??
      WorkflowAction.COMPLETE_AND_ADVANCE
    );
  }

  private static isAction(value: string): boolean {
    return (Object.values(WorkflowAction) as string[]).includes(value);
  }

  // ── Action handlers (each reuses existing services) ───────────────────────

  /** Completes the activity and creates the rule's generated event as the next one. */
  private async completeAndAdvance(
    ctx: WorkflowContext,
    rule: RuleRow | null,
    advance: boolean,
  ): Promise<WorkflowExecutionResult> {
    await this.activities.transition(ctx.activityId, 'COMPLETED', { complete: true });

    let nextActivityId: string | null = null;
    let enrollmentStatus: string | null = null;

    if (rule?.generated_event_id) {
      const created = await this.activities.createInitialActivity({
        enrollmentId: ctx.enrollmentId,
        eventId: rule.generated_event_id,
        programId: ctx.programId,
        diseaseId: ctx.diseaseId,
        dueDate: WorkflowEngine.dueDate(rule.delay_days),
      });
      nextActivityId = created?.id ?? null;
      if (advance) {
        await this.enrollments.advanceToEvent(ctx.enrollmentId, rule.generated_event_id);
      }
    } else {
      // No onward event configured → the care plan has reached its end.
      await this.enrollments.setStatus(ctx.enrollmentId, 'COMPLETED');
      enrollmentStatus = 'COMPLETED';
    }

    return {
      action: advance ? WorkflowAction.COMPLETE_AND_ADVANCE : WorkflowAction.CREATE_ACTIVITY,
      message: nextActivityId
        ? 'Activity completed and next activity scheduled.'
        : 'Activity completed; care plan finished.',
      nextActivityId,
      enrollmentStatus,
      escalated: false,
      notified: false,
      attempt: null,
    };
  }

  /**
   * Retries the SAME activity per the program/disease retry policy: increments the
   * attempt count, pushes the due date by the configured interval, and escalates
   * automatically once the configured thresholds are reached.
   */
  private async retry(
    ctx: WorkflowContext,
    conditions: RuleConditions,
    retry: RetryPolicy | null,
  ): Promise<WorkflowExecutionResult> {
    const policy: RetryPolicy = retry ?? {
      maxAttempts: 3,
      retryIntervalHours: 24,
      escalationAfterAttempts: 3,
      escalationRole: (conditions.escalationRole as string) ?? null,
    };

    const attempt = await this.activities.recordAttempt(ctx.activityId);
    const role = policy.escalationRole ?? (conditions.escalationRole as string) ?? 'CLINICIAN';

    // Exhausted all attempts → stop retrying and escalate.
    if (attempt >= policy.maxAttempts) {
      await this.activities.transition(ctx.activityId, 'EMERGENCY', {
        complete: true,
        escalate: true,
      });
      const notified = await this.notify(
        ctx,
        role,
        `Activity escalated after ${attempt} unsuccessful contact attempts.`,
      );
      return {
        action: WorkflowAction.RETRY_ACTIVITY,
        message: `Maximum attempts (${policy.maxAttempts}) reached — escalated.`,
        nextActivityId: null,
        enrollmentStatus: null,
        escalated: true,
        notified,
        attempt,
      };
    }

    // Otherwise schedule the next attempt; notify once the escalation threshold hits.
    const days = Math.max(0, Math.round(policy.retryIntervalHours / 24));
    await this.activities.rescheduleDue(ctx.activityId, days);

    let escalated = false;
    let notified = false;
    if (attempt >= policy.escalationAfterAttempts) {
      escalated = true;
      notified = await this.notify(
        ctx,
        role,
        `Contact attempt ${attempt} unsuccessful — supervisor attention requested.`,
      );
    }

    return {
      action: WorkflowAction.RETRY_ACTIVITY,
      message: `Retry scheduled (attempt ${attempt} of ${policy.maxAttempts}).`,
      nextActivityId: null,
      enrollmentStatus: null,
      escalated,
      notified,
      attempt,
    };
  }

  /** Marks the current activity rescheduled and creates a fresh attempt of the same event. */
  private async reschedule(
    ctx: WorkflowContext,
    rule: RuleRow | null,
  ): Promise<WorkflowExecutionResult> {
    await this.activities.transition(ctx.activityId, 'RESCHEDULED', { complete: true });

    let nextActivityId: string | null = null;
    if (ctx.eventId) {
      const created = await this.activities.createActivity(ctx.enrollmentId, {
        eventId: ctx.eventId,
        dueDate: WorkflowEngine.dueDate(rule?.delay_days ?? 7),
        priority: rule?.priority,
      });
      nextActivityId = created.id;
    }
    return {
      action: WorkflowAction.RESCHEDULE_ACTIVITY,
      message: 'Activity rescheduled.',
      nextActivityId,
      enrollmentStatus: null,
      escalated: false,
      notified: false,
      attempt: null,
    };
  }

  /** Refers the patient onward: marks REFERRED and creates the referral activity. */
  private async createReferral(
    ctx: WorkflowContext,
    rule: RuleRow | null,
    conditions: RuleConditions,
  ): Promise<WorkflowExecutionResult> {
    await this.activities.transition(ctx.activityId, 'REFERRED', { complete: true });

    let nextActivityId: string | null = null;
    if (rule?.generated_event_id) {
      const created = await this.activities.createInitialActivity({
        enrollmentId: ctx.enrollmentId,
        eventId: rule.generated_event_id,
        programId: ctx.programId,
        diseaseId: ctx.diseaseId,
        dueDate: WorkflowEngine.dueDate(rule.delay_days),
      });
      nextActivityId = created?.id ?? null;
    }
    const role = (conditions.notificationRole as string) ?? (conditions.escalationRole as string);
    const notified = role
      ? await this.notify(ctx, role, 'Patient referred for further care.')
      : false;

    return {
      action: WorkflowAction.CREATE_REFERRAL,
      message: 'Referral created.',
      nextActivityId,
      enrollmentStatus: null,
      escalated: false,
      notified,
      attempt: null,
    };
  }

  /** Puts the program on hold or closes it; completes the current activity. */
  private async holdOrClose(
    ctx: WorkflowContext,
    action: WorkflowAction.HOLD_PROGRAM | WorkflowAction.CLOSE_PROGRAM,
  ): Promise<WorkflowExecutionResult> {
    const status = action === WorkflowAction.HOLD_PROGRAM ? 'ON_HOLD' : 'CLOSED';
    await this.activities.transition(ctx.activityId, 'COMPLETED', { complete: true });
    await this.enrollments.setStatus(ctx.enrollmentId, status);
    return {
      action,
      message: action === WorkflowAction.HOLD_PROGRAM ? 'Program placed on hold.' : 'Program closed.',
      nextActivityId: null,
      enrollmentStatus: status,
      escalated: false,
      notified: false,
      attempt: null,
    };
  }

  /** Escalates the activity (emergency) and notifies the escalation role. */
  private async escalate(
    ctx: WorkflowContext,
    conditions: RuleConditions,
  ): Promise<WorkflowExecutionResult> {
    await this.activities.transition(ctx.activityId, 'EMERGENCY', {
      complete: true,
      escalate: true,
    });
    const role = (conditions.escalationRole as string) ?? 'CLINICIAN';
    const notified = await this.notify(ctx, role, 'Activity escalated for urgent clinical attention.');
    return {
      action: WorkflowAction.ESCALATE,
      message: 'Activity escalated.',
      nextActivityId: null,
      enrollmentStatus: null,
      escalated: true,
      notified,
      attempt: null,
    };
  }

  /** Sends a notification only; the activity status is left unchanged. */
  private async sendNotification(
    ctx: WorkflowContext,
    conditions: RuleConditions,
  ): Promise<WorkflowExecutionResult> {
    const role = (conditions.notificationRole as string) ?? 'CARE_ASSISTANT';
    const notified = await this.notify(ctx, role, 'Workflow notification raised for this activity.');
    return {
      action: WorkflowAction.SEND_NOTIFICATION,
      message: notified ? `Notification sent to ${role}.` : 'No notification recipient configured.',
      nextActivityId: null,
      enrollmentStatus: null,
      escalated: false,
      notified,
      attempt: null,
    };
  }

  /** Best-effort notification write; never fails the workflow. */
  private async notify(
    ctx: WorkflowContext,
    recipient: string | null,
    message: string,
  ): Promise<boolean> {
    if (!recipient) return false;
    try {
      await this.repo.insertNotification({
        recipient,
        message,
        relatedActivityId: ctx.activityId,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Notification insert failed: ${(error as Error).message}`);
      return false;
    }
  }

  /** ISO date (YYYY-MM-DD) for today + delayDays. */
  private static dueDate(delayDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + (Number.isFinite(delayDays) ? delayDays : 0));
    return d.toISOString().slice(0, 10);
  }
}
