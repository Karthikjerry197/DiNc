import { Injectable } from '@nestjs/common';
import type { CdsRecommendation, ClinicalContext } from '../cdse.types';
import type { ClinicalRule } from '../engine/rule.interface';

/**
 * Rule: Missed Follow-up Contact
 *
 * IF:  citizen has one or more worklist items that are PENDING or IN_PROGRESS
 *      and whose due_date has already passed
 * THEN: recommend a follow-up contact
 *
 * This is a safety-net rule. A missed follow-up is always actionable regardless
 * of programme context. Multiple overdue items escalate the priority.
 */
@Injectable()
export class MissedFollowupRule implements ClinicalRule {
  readonly id = 'missed-followup';
  readonly name = 'Missed Scheduled Follow-up';
  readonly domain = 'SAFETY';

  evaluate(ctx: ClinicalContext): CdsRecommendation | null {
    const overdue = ctx.overdueWorklist;
    if (overdue.length === 0) return null;

    const count = overdue.length;
    const worst = overdue[0]; // sorted ASC by due_date — earliest is most overdue

    const reasons: string[] = [
      `${count} scheduled follow-up${count === 1 ? '' : 's'} ${count === 1 ? 'has' : 'have'} passed their due date`,
    ];

    if (worst.dueDate) {
      reasons.push(
        `Earliest overdue since: ${worst.dueDate}` +
          ` (${worst.daysOverdue} day${worst.daysOverdue === 1 ? '' : 's'} overdue)`,
      );
    }

    if (ctx.totalConsultations === 0) {
      reasons.push('Citizen has never had a recorded consultation');
    }

    // Multiple missed follow-ups = CRITICAL; single = HIGH
    const priority = count >= 3 ? 'CRITICAL' : 'HIGH';

    return {
      ruleId: this.id,
      title: count >= 3 ? 'Multiple Follow-ups Missed — Urgent Contact Required' : 'Missed Follow-up Contact Required',
      explanation:
        'Missed scheduled follow-ups disrupt the care pathway and may indicate the citizen has disengaged from the programme or is experiencing a health crisis.',
      reasons,
      action:
        'Contact the citizen immediately by phone. If no response, escalate to a home visit or alternative contact. Reschedule the overdue follow-up and document the reason for the missed appointment.',
      priority,
      supportingRule: `${this.name} — any missed follow-up triggers re-contact per NHM care protocol`,
    };
  }
}
