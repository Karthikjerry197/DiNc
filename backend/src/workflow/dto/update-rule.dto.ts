import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { WORKFLOW_ACTIONS } from '../workflow.types';

/** Priorities accepted on a rule (worklist_items.priority is varchar(8)). */
export const RULE_PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const;

/**
 * Request body for POST /api/workflow/rules/:id.
 *
 * Edits only the configurable parts of an existing rule. The outcome a rule fires
 * for (outcome_type_id) is the rule's identity and is never reassigned here.
 */
export class UpdateRuleDto {
  @IsIn(WORKFLOW_ACTIONS, { message: 'Invalid workflow action.' })
  action!: string;

  @IsOptional()
  @IsUUID('4', { message: 'A valid next activity (event) must be selected.' })
  generatedEventId?: string;

  @IsInt({ message: 'Delay must be a whole number of days.' })
  @Min(0)
  @Max(365)
  delayDays!: number;

  @IsIn(RULE_PRIORITIES, { message: 'Invalid priority.' })
  priority!: string;

  @IsOptional()
  @IsString()
  retryPolicy?: string | null;

  @IsOptional()
  @IsString()
  escalationRole?: string | null;

  @IsOptional()
  @IsString()
  notificationRole?: string | null;

  /** Optional extra metadata merged into conditions (future branching, etc.). */
  @IsOptional()
  @IsObject()
  extraConditions?: Record<string, unknown>;

  @IsBoolean()
  isActive!: boolean;
}
