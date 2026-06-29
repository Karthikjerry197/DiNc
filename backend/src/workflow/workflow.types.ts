/**
 * Workflow Rules Engine types.
 *
 * The engine is fully database-driven: the action to perform after a consultation
 * outcome comes from `rules.conditions.action` (an extensible enum), the target
 * event/delay/priority from the existing `rules` columns, and retry behaviour from
 * `retry_config`. No outcome is ever decided by `if (outcome === '...')` in code.
 */

/** The configurable workflow actions. Extend by adding a member + a handler. */
export enum WorkflowAction {
  COMPLETE_AND_ADVANCE = 'COMPLETE_AND_ADVANCE',
  RETRY_ACTIVITY = 'RETRY_ACTIVITY',
  RESCHEDULE_ACTIVITY = 'RESCHEDULE_ACTIVITY',
  CREATE_ACTIVITY = 'CREATE_ACTIVITY',
  CREATE_REFERRAL = 'CREATE_REFERRAL',
  HOLD_PROGRAM = 'HOLD_PROGRAM',
  CLOSE_PROGRAM = 'CLOSE_PROGRAM',
  ESCALATE = 'ESCALATE',
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',
}

export const WORKFLOW_ACTIONS = Object.values(WorkflowAction);

/** Shape stored in the existing `rules.conditions` jsonb column (all optional). */
export interface RuleConditions {
  action?: WorkflowAction | string;
  /** Named retry policy hint (the concrete numbers come from retry_config). */
  retryPolicy?: string | null;
  escalationRole?: string | null;
  notificationRole?: string | null;
  /** Reserved for future conditional branching / extensions. */
  [key: string]: unknown;
}

/** A resolved retry policy (from retry_config) for a program + disease. */
export interface RetryPolicy {
  maxAttempts: number;
  retryIntervalHours: number;
  escalationAfterAttempts: number;
  escalationRole: string | null;
}

/** Raw rule row joined for execution. */
export interface RuleRow {
  id: string;
  outcome_type_id: string;
  generated_event_id: string | null;
  delay_days: number;
  priority: string;
  conditions: RuleConditions | null;
  is_active: boolean;
}

/** The context the engine needs to execute a rule for one consultation. */
export interface WorkflowContext {
  activityId: string;
  enrollmentId: string;
  programId: string | null;
  diseaseId: string | null;
  eventId: string | null;
  outcomeTypeId: string;
  outcomeCategory: string | null;
  recordedBy: string | null;
}

/** What the engine did, returned to the caller (consultation) and the UI. */
export interface WorkflowExecutionResult {
  action: WorkflowAction;
  /** Human-readable summary of what happened. */
  message: string;
  /** The id of a newly created activity (next / referral / reschedule), if any. */
  nextActivityId: string | null;
  /** The enrollment status after execution (may be unchanged). */
  enrollmentStatus: string | null;
  escalated: boolean;
  notified: boolean;
  attempt: number | null;
}

// ── Admin (read/write) DTOs ──────────────────────────────────────────────────

/** A workflow rule resolved to human-readable values for the admin table. */
export interface WorkflowRuleDto {
  id: string;
  outcome: string;
  outcomeCode: string;
  category: string;
  /** The event this rule fires for (the outcome's event context). */
  forEvent: string | null;
  action: string;
  nextActivity: string | null;
  generatedEventId: string | null;
  delayDays: number;
  priority: string;
  retryPolicy: string | null;
  escalationRole: string | null;
  notificationRole: string | null;
  conditions: RuleConditions | null;
  isActive: boolean;
}

export interface EventOptionDto {
  id: string;
  name: string;
  code: string;
}

export interface RetryConfigDto {
  id: string;
  program: string | null;
  disease: string | null;
  maxAttempts: number;
  retryIntervalHours: number;
  escalationAfterAttempts: number;
  escalationRole: string | null;
  isActive: boolean;
}

/** Everything the Administration → Workflow Rules page needs in one payload. */
export interface WorkflowRulesOverviewDto {
  rules: WorkflowRuleDto[];
  options: {
    actions: string[];
    priorities: string[];
    roles: string[];
    events: EventOptionDto[];
    retryPolicies: string[];
  };
  retryConfigs: RetryConfigDto[];
}
