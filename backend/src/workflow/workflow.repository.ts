import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  EventOptionDto,
  RetryConfigDto,
  RetryPolicy,
  RuleConditions,
  RuleRow,
  WorkflowRuleDto,
} from './workflow.types';

/**
 * Data-access layer for the Workflow Rules Engine. The ONLY place holding SQL for
 * workflow rules / retry policies. Reuses the existing `rules`, `retry_config`,
 * `outcome_types` and `events` tables — no new workflow tables are created.
 *
 * On startup it performs an idempotent, additive seed: it backfills the existing
 * (empty) `rules.conditions` with workflow-action metadata WHERE it is still NULL
 * (never overwriting admin edits), and populates the empty `retry_config` table
 * with sensible defaults ONLY when it is empty. The same statements ship as
 * scripts/workflow_rules_seed.sql for teams who apply schema out-of-band.
 */
@Injectable()
export class WorkflowRepository implements OnModuleInit {
  private readonly logger = new Logger(WorkflowRepository.name);

  /** Programs treated as acute → Urgent retry policy when seeding retry_config. */
  private static readonly URGENT_PROGRAM_CODES = [
    'CARDIAC',
    'COMMUNICABLE',
    'ONCOLOGY',
    'RENAL',
    'MATERNAL',
  ];

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.backfillRuleConditions();
    await this.seedRetryConfig();
  }

  // ── Engine reads ─────────────────────────────────────────────────────────

  /** The active rule for an outcome type (the engine's primary lookup). */
  async findRuleByOutcomeType(outcomeTypeId: string): Promise<RuleRow | null> {
    const result = await this.db.query<RuleRow>(
      `SELECT id, outcome_type_id, generated_event_id, delay_days, priority,
              conditions, is_active
       FROM public.rules
       WHERE outcome_type_id = $1 AND is_active = true
       ORDER BY updated_at DESC
       LIMIT 1`,
      [outcomeTypeId],
    );
    return result.rows[0] ?? null;
  }

  /** The retry policy for a program + disease, or null when none configured. */
  async findRetryPolicy(
    programId: string | null,
    diseaseId: string | null,
  ): Promise<RetryPolicy | null> {
    if (!programId || !diseaseId) return null;
    const result = await this.db.query<{
      max_attempts: number;
      retry_interval_hours: number;
      escalation_after_attempts: number;
      escalation_role: string | null;
    }>(
      `SELECT max_attempts, retry_interval_hours, escalation_after_attempts, escalation_role
       FROM public.retry_config
       WHERE program_id = $1 AND disease_id = $2 AND is_active = true
       LIMIT 1`,
      [programId, diseaseId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      maxAttempts: row.max_attempts,
      retryIntervalHours: row.retry_interval_hours,
      escalationAfterAttempts: row.escalation_after_attempts,
      escalationRole: row.escalation_role,
    };
  }

  /** Records a workflow notification (used by SEND_NOTIFICATION / ESCALATE). */
  async insertNotification(input: {
    recipient: string;
    message: string;
    relatedActivityId: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO public.notifications
         (recipient_id, channel, message, status, related_entity_id, related_entity_type)
       VALUES ($1, 'IN_APP', $2, 'PENDING', $3, 'WORKLIST_ITEM')`,
      [input.recipient, input.message, input.relatedActivityId],
    );
  }

  // ── Admin reads/writes ─────────────────────────────────────────────────────

  /** All rules resolved to human-readable values for the Administration table. */
  async listRules(): Promise<WorkflowRuleDto[]> {
    const result = await this.db.query<{
      id: string;
      outcome: string;
      outcome_code: string;
      category: string;
      for_event: string | null;
      generated_event_id: string | null;
      next_activity: string | null;
      delay_days: number;
      priority: string;
      conditions: RuleConditions | null;
      is_active: boolean;
    }>(
      `SELECT r.id,
              ot.name AS outcome,
              ot.code AS outcome_code,
              ot.category AS category,
              fe.name AS for_event,
              r.generated_event_id,
              ge.name AS next_activity,
              r.delay_days,
              r.priority,
              r.conditions,
              r.is_active
       FROM public.rules r
       JOIN public.outcome_types ot ON ot.id = r.outcome_type_id
       LEFT JOIN public.events fe ON fe.id = ot.event_id
       LEFT JOIN public.events ge ON ge.id = r.generated_event_id
       ORDER BY fe.name NULLS LAST, ot.category, ot.name
       LIMIT 1000`,
    );
    return result.rows.map((row) => WorkflowRepository.toRuleDto(row));
  }

  async findRuleById(id: string): Promise<WorkflowRuleDto | null> {
    const result = await this.db.query<{
      id: string;
      outcome: string;
      outcome_code: string;
      category: string;
      for_event: string | null;
      generated_event_id: string | null;
      next_activity: string | null;
      delay_days: number;
      priority: string;
      conditions: RuleConditions | null;
      is_active: boolean;
    }>(
      `SELECT r.id, ot.name AS outcome, ot.code AS outcome_code, ot.category,
              fe.name AS for_event, r.generated_event_id, ge.name AS next_activity,
              r.delay_days, r.priority, r.conditions, r.is_active
       FROM public.rules r
       JOIN public.outcome_types ot ON ot.id = r.outcome_type_id
       LEFT JOIN public.events fe ON fe.id = ot.event_id
       LEFT JOIN public.events ge ON ge.id = r.generated_event_id
       WHERE r.id = $1
       LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    return row ? WorkflowRepository.toRuleDto(row) : null;
  }

  /** Updates an editable rule. generatedEventId must reference an existing event. */
  async updateRule(
    id: string,
    fields: {
      generatedEventId: string | null;
      delayDays: number;
      priority: string;
      conditions: RuleConditions;
      isActive: boolean;
    },
  ): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `UPDATE public.rules
         SET generated_event_id = COALESCE($2, generated_event_id),
             delay_days = $3,
             priority = $4,
             conditions = $5::jsonb,
             is_active = $6,
             updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [
        id,
        fields.generatedEventId,
        fields.delayDays,
        fields.priority,
        JSON.stringify(fields.conditions ?? {}),
        fields.isActive,
      ],
    );
    return result.rows.length > 0;
  }

  /** Active events (id, name, code) for the rule editor's "Next Activity" picker. */
  async listEvents(): Promise<EventOptionDto[]> {
    const result = await this.db.query<EventOptionDto>(
      `SELECT id, name, code
       FROM public.events
       WHERE is_active = true
       ORDER BY name
       LIMIT 1000`,
    );
    return result.rows;
  }

  /** Retry policies resolved to program/disease names for the admin view. */
  async listRetryConfigs(): Promise<RetryConfigDto[]> {
    const result = await this.db.query<{
      id: string;
      program: string | null;
      disease: string | null;
      max_attempts: number;
      retry_interval_hours: number;
      escalation_after_attempts: number;
      escalation_role: string | null;
      is_active: boolean;
    }>(
      `SELECT rc.id, p.name AS program, d.name AS disease,
              rc.max_attempts, rc.retry_interval_hours,
              rc.escalation_after_attempts, rc.escalation_role, rc.is_active
       FROM public.retry_config rc
       LEFT JOIN public.programs p ON p.id = rc.program_id
       LEFT JOIN public.diseases d ON d.id = rc.disease_id
       ORDER BY p.name NULLS LAST, d.name
       LIMIT 1000`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      program: row.program,
      disease: row.disease,
      maxAttempts: row.max_attempts,
      retryIntervalHours: row.retry_interval_hours,
      escalationAfterAttempts: row.escalation_after_attempts,
      escalationRole: row.escalation_role,
      isActive: row.is_active,
    }));
  }

  // ── Seeding (idempotent, additive) ─────────────────────────────────────────

  /**
   * Backfills workflow-action metadata into rules.conditions, derived from the
   * outcome category, ONLY where conditions is still NULL — so administrator edits
   * are never overwritten.
   */
  private async backfillRuleConditions(): Promise<void> {
    try {
      const result = await this.db.query(
        `UPDATE public.rules r
           SET conditions = jsonb_build_object(
                 'action', CASE ot.category
                    WHEN 'POSITIVE' THEN 'COMPLETE_AND_ADVANCE'
                    WHEN 'NEUTRAL' THEN 'RETRY_ACTIVITY'
                    WHEN 'NEGATIVE' THEN 'RETRY_ACTIVITY'
                    WHEN 'ESCALATION' THEN 'ESCALATE'
                    ELSE 'CREATE_ACTIVITY' END,
                 'retryPolicy', CASE WHEN ot.category IN ('NEUTRAL','NEGATIVE')
                    THEN 'STANDARD' ELSE NULL END,
                 'escalationRole', CASE WHEN ot.category IN ('NEGATIVE','ESCALATION')
                    THEN 'CLINICIAN' ELSE NULL END,
                 'notificationRole', CASE WHEN ot.category = 'ESCALATION'
                    THEN 'CLINICIAN' ELSE NULL END
               ),
               updated_at = now()
         FROM public.outcome_types ot
         WHERE ot.id = r.outcome_type_id AND r.conditions IS NULL`,
      );
      if (result.rowCount) {
        this.logger.log(`Backfilled workflow actions into ${result.rowCount} rules.`);
      }
    } catch (error) {
      this.logger.error(`Rule conditions backfill failed: ${(error as Error).message}`);
    }
  }

  /**
   * Seeds retry_config with one row per (program, disease) when the table is empty.
   * Acute programs get an Urgent policy (5 attempts / 4h / escalate after 2);
   * everything else gets Standard (3 / 24h / escalate after 3).
   */
  private async seedRetryConfig(): Promise<void> {
    try {
      const acute = WorkflowRepository.URGENT_PROGRAM_CODES.map((c) => `'${c}'`).join(',');
      const result = await this.db.query(
        `INSERT INTO public.retry_config
           (program_id, disease_id, max_attempts, retry_interval_hours,
            escalation_after_attempts, escalation_role, is_active)
         SELECT p.id, d.id,
                CASE WHEN p.code IN (${acute}) THEN 5 ELSE 3 END,
                CASE WHEN p.code IN (${acute}) THEN 4 ELSE 24 END,
                CASE WHEN p.code IN (${acute}) THEN 2 ELSE 3 END,
                'CLINICIAN', true
         FROM public.programs p
         JOIN public.sub_programs sp ON sp.program_id = p.id
         JOIN public.diseases d ON d.sub_program_id = sp.id
         WHERE NOT EXISTS (SELECT 1 FROM public.retry_config)`,
      );
      if (result.rowCount) {
        this.logger.log(`Seeded ${result.rowCount} retry policies.`);
      }
    } catch (error) {
      this.logger.error(`retry_config seed failed: ${(error as Error).message}`);
    }
  }

  private static toRuleDto(row: {
    id: string;
    outcome: string;
    outcome_code: string;
    category: string;
    for_event: string | null;
    generated_event_id: string | null;
    next_activity: string | null;
    delay_days: number;
    priority: string;
    conditions: RuleConditions | null;
    is_active: boolean;
  }): WorkflowRuleDto {
    const c = row.conditions ?? {};
    return {
      id: row.id,
      outcome: row.outcome,
      outcomeCode: row.outcome_code,
      category: row.category,
      forEvent: row.for_event,
      action: (c.action as string) ?? '',
      nextActivity: row.next_activity,
      generatedEventId: row.generated_event_id,
      delayDays: row.delay_days,
      priority: row.priority,
      retryPolicy: (c.retryPolicy as string) ?? null,
      escalationRole: (c.escalationRole as string) ?? null,
      notificationRole: (c.notificationRole as string) ?? null,
      conditions: row.conditions,
      isActive: row.is_active,
    };
  }
}
