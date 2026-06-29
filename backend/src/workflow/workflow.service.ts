import { Injectable, NotFoundException } from '@nestjs/common';
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
  /** Roles available as escalation/notification recipients. */
  private static readonly ROLES = ['ADMIN', 'CLINICIAN', 'CARE_ASSISTANT'];
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

    // Preserve any unknown/extension keys already stored on the rule, then apply
    // the editor's structured fields on top — keeping conditions generic.
    const conditions: RuleConditions = {
      ...(existing.conditions ?? {}),
      ...(dto.extraConditions ?? {}),
      action: dto.action,
      retryPolicy: dto.retryPolicy ?? null,
      escalationRole: dto.escalationRole ?? null,
      notificationRole: dto.notificationRole ?? null,
    };

    const ok = await this.repo.updateRule(id, {
      generatedEventId: dto.generatedEventId ?? existing.generatedEventId,
      delayDays: dto.delayDays,
      priority: dto.priority,
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
