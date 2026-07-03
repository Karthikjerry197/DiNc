import { Injectable, NotFoundException } from '@nestjs/common';
import { ASSIGNABLE_ROLES } from '../users/user.types';
import { WorkflowRepository } from './workflow.repository';
import { UpdateRuleDto, RULE_PRIORITIES } from './dto/update-rule.dto';
import {
  RuleConditions,
  WORKFLOW_ACTIONS,
  WorkflowRuleDto,
  WorkflowRulesOverviewDto,
} from './workflow.types';

/**
 * Administration-facing service for the Workflow Rules Engine. Provides the
 * read-only overview powering the Administration → Workflow Rules table and the
 * single rule-update path used by the Rule Editor. Holds no SQL and no execution
 * logic (that lives in the engine) — it assembles options and shapes the
 * conditions JSON before delegating to the repository.
 */
@Injectable()
export class WorkflowService {
  /**
   * Roles offered in the rule editor (escalation/notification recipients and
   * M31 assignment). Reuses the Users & Roles module's single role vocabulary.
   */
  private static readonly ROLES: string[] = [...ASSIGNABLE_ROLES];
  private static readonly RETRY_POLICIES = ['STANDARD', 'URGENT', 'NONE'];

  constructor(private readonly repo: WorkflowRepository) {}

  /** Everything the Workflow Rules admin page needs in one payload. */
  async getOverview(): Promise<WorkflowRulesOverviewDto> {
    const [rules, events, retryConfigs] = await Promise.all([
      this.repo.listRules(),
      this.repo.listEvents(),
      this.repo.listRetryConfigs(),
    ]);
    return {
      rules,
      options: {
        actions: WORKFLOW_ACTIONS,
        priorities: [...RULE_PRIORITIES],
        roles: WorkflowService.ROLES,
        events,
        retryPolicies: WorkflowService.RETRY_POLICIES,
      },
      retryConfigs,
    };
  }

  /** Updates a rule from the editor, assembling the conditions JSON. */
  async updateRule(id: string, dto: UpdateRuleDto): Promise<WorkflowRuleDto> {
    const existing = await this.repo.findRuleById(id);
    if (!existing) {
      throw new NotFoundException('Workflow rule not found.');
    }

    // Preserve-on-omit. The action-aware Rule Editor submits ONLY the fields the
    // selected action actually uses (e.g. RETRY_ACTIVITY sends no Delay/priority,
    // ESCALATE sends no Next Activity). We must therefore treat an omitted field
    // as "leave unchanged", not "clear": any DTO field left undefined keeps its
    // stored value instead of being reset to null, so editing one action never
    // wipes configuration another action relies on. Unknown/extension condition
    // keys are preserved too. (Admin config write-model only — the WorkflowEngine
    // and execution behaviour are untouched.)
    const prev: RuleConditions = existing.conditions ?? {};
    const conditions: RuleConditions = {
      ...prev,
      ...(dto.extraConditions ?? {}),
      action: dto.action,
      retryPolicy: dto.retryPolicy !== undefined ? dto.retryPolicy : (prev.retryPolicy ?? null),
      escalationRole:
        dto.escalationRole !== undefined ? dto.escalationRole : (prev.escalationRole ?? null),
      notificationRole:
        dto.notificationRole !== undefined ? dto.notificationRole : (prev.notificationRole ?? null),
      assignedRole:
        dto.assignedRole !== undefined ? dto.assignedRole : (prev.assignedRole ?? null),
    };

    const ok = await this.repo.updateRule(id, {
      generatedEventId: dto.generatedEventId ?? existing.generatedEventId,
      delayDays: dto.delayDays !== undefined ? dto.delayDays : existing.delayDays,
      priority: dto.priority !== undefined ? dto.priority : existing.priority,
      conditions,
      isActive: dto.isActive,
    });
    if (!ok) {
      throw new NotFoundException('Workflow rule not found.');
    }

    const updated = await this.repo.findRuleById(id);
    if (!updated) {
      throw new NotFoundException('Workflow rule could not be loaded after update.');
    }
    return updated;
  }
}
