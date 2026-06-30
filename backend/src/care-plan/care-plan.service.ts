import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CdseService } from '../cdse/cdse.service';
import type { CdsRecommendation } from '../cdse/cdse.types';
import type {
  CarePlanDto,
  CarePlanGoalDto,
  CarePlanProgressDto,
  CarePlanSummaryDto,
  CdseDecisionResultDto,
  CdseGoalSuggestionDto,
  GoalCategory,
  GoalPriority,
} from './care-plan.types';
import { CarePlanRepository } from './care-plan.repository';
import type { BulkCdseDecisionsDto } from './dto/cdse-decisions.dto';
import type { CreateCarePlanDto } from './dto/create-care-plan.dto';
import type { RecordProgressDto } from './dto/record-progress.dto';
import type { UpdateCarePlanDto } from './dto/update-care-plan.dto';
import type { UpsertGoalDto } from './dto/upsert-goal.dto';
import type { UpsertInterventionDto } from './dto/upsert-intervention.dto';
import type { UpsertProblemDto } from './dto/upsert-problem.dto';

// ── CDSE rule → care plan mapping ─────────────────────────────────────────────

interface CdseRuleMapping {
  problemTitle: string;
  goalTitle: string;
  description: string;
  targetValue: string | null;
  category: GoalCategory;
  priority: GoalPriority;
}

const CDSE_RULE_MAP: Record<string, CdseRuleMapping> = {
  'bp-review-30d': {
    problemTitle: 'Uncontrolled Hypertension',
    goalTitle: 'Blood Pressure Control',
    description:
      'Achieve and maintain blood pressure within target range through regular monitoring and lifestyle modifications.',
    targetValue: '< 130/80 mmHg',
    category: 'CLINICAL',
    priority: 'HIGH',
  },
  'hba1c-review-90d': {
    problemTitle: 'Uncontrolled Diabetes',
    goalTitle: 'Blood Sugar (HbA1c) Control',
    description:
      'Achieve optimal glycaemic control through regular monitoring, dietary adherence, and medication management.',
    targetValue: 'HbA1c < 7%',
    category: 'CLINICAL',
    priority: 'HIGH',
  },
  'missed-followup': {
    problemTitle: 'Missed Follow-up',
    goalTitle: 'Regular Follow-up Adherence',
    description:
      'Ensure the citizen attends all scheduled follow-up consultations without missing appointments.',
    targetValue: '0 missed follow-ups',
    category: 'CLINICAL',
    priority: 'CRITICAL',
  },
  'bmi-lifestyle-25': {
    problemTitle: 'Overweight / Obesity Risk',
    goalTitle: 'Weight and Lifestyle Management',
    description:
      'Achieve and maintain a healthy weight through dietary counselling, physical activity promotion, and lifestyle modifications.',
    targetValue: 'BMI < 25',
    category: 'LIFESTYLE',
    priority: 'ROUTINE',
  },
  'medication-review-180d': {
    problemTitle: 'Medication Review Due',
    goalTitle: 'Medication Reconciliation',
    description:
      'Ensure medications are reviewed regularly to assess efficacy, patient compliance, and any side effects.',
    targetValue: 'Review every 6 months',
    category: 'MEDICATION',
    priority: 'ROUTINE',
  },
};

/** Roles authorised to record ESCALATION progress entries. */
const ESCALATION_ROLES = new Set(['CLINICIAN', 'ADMIN']);

@Injectable()
export class CarePlanService {
  constructor(
    private readonly repo: CarePlanRepository,
    private readonly cdse: CdseService,
  ) {}

  // ── Care Plan ─────────────────────────────────────────────────────────────

  async getForCitizen(citizenId: string): Promise<CarePlanDto | null> {
    return this.repo.findByCitizenId(citizenId);
  }

  async getSummaryForCitizen(citizenId: string): Promise<CarePlanSummaryDto | null> {
    return this.repo.findSummaryByCitizenId(citizenId);
  }

  async getById(carePlanId: string): Promise<CarePlanDto> {
    const plan = await this.repo.findById(carePlanId);
    if (!plan) throw new NotFoundException('Care plan not found.');
    return plan;
  }

  async create(citizenId: string, dto: CreateCarePlanDto, user: string): Promise<CarePlanDto> {
    const existing = await this.repo.findIdByCitizenId(citizenId);
    if (existing) {
      throw new ConflictException(
        'An integrated care plan already exists for this citizen.',
      );
    }
    const id = await this.repo.create(citizenId, dto, user);
    return this.repo.findById(id) as Promise<CarePlanDto>;
  }

  async update(carePlanId: string, dto: UpdateCarePlanDto, user: string): Promise<CarePlanDto> {
    await this.requirePlan(carePlanId);
    await this.repo.update(carePlanId, dto, user);
    return this.repo.findById(carePlanId) as Promise<CarePlanDto>;
  }

  // ── Problems ──────────────────────────────────────────────────────────────

  async addProblem(carePlanId: string, dto: UpsertProblemDto, user: string): Promise<CarePlanDto> {
    await this.requirePlan(carePlanId);

    let programId: string | null = null;
    if (dto.enrollmentId) {
      programId = await this.repo.findProblemProgramId(dto.enrollmentId);
    }

    await this.repo.addProblem(carePlanId, dto, programId, user);
    return this.repo.findById(carePlanId) as Promise<CarePlanDto>;
  }

  async updateProblem(
    carePlanId: string,
    problemId: string,
    dto: UpsertProblemDto,
    user: string,
  ): Promise<CarePlanDto> {
    await this.requirePlanOwnsEntity(carePlanId, async () => {
      const owner = await this.repo.findProblemOwner(problemId);
      return owner === carePlanId;
    });

    let programId: string | null = null;
    if (dto.enrollmentId) {
      programId = await this.repo.findProblemProgramId(dto.enrollmentId);
    }

    await this.repo.updateProblem(problemId, carePlanId, { ...dto, enrollmentId: dto.enrollmentId }, user);
    return this.repo.findById(carePlanId) as Promise<CarePlanDto>;
  }

  async deleteProblem(carePlanId: string, problemId: string, user: string): Promise<CarePlanDto> {
    await this.requirePlanOwnsEntity(carePlanId, async () => {
      const owner = await this.repo.findProblemOwner(problemId);
      return owner === carePlanId;
    });
    await this.repo.deleteProblem(problemId, carePlanId, user);
    return this.repo.findById(carePlanId) as Promise<CarePlanDto>;
  }

  // ── Goals ─────────────────────────────────────────────────────────────────

  async addGoal(
    carePlanId: string,
    problemId: string,
    dto: UpsertGoalDto,
    user: string,
  ): Promise<CarePlanGoalDto> {
    await this.requirePlan(carePlanId);
    await this.requirePlanOwnsEntity(carePlanId, async () => {
      const owner = await this.repo.findProblemOwner(problemId);
      return owner === carePlanId;
    });
    return this.repo.addGoal(problemId, carePlanId, dto, user);
  }

  async updateGoal(
    carePlanId: string,
    goalId: string,
    dto: UpsertGoalDto,
    user: string,
  ): Promise<CarePlanDto> {
    await this.requirePlanOwnsGoal(carePlanId, goalId);
    await this.repo.updateGoal(goalId, carePlanId, dto, user);
    return this.repo.findById(carePlanId) as Promise<CarePlanDto>;
  }

  async updateGoalStatus(
    carePlanId: string,
    goalId: string,
    status: string,
    user: string,
  ): Promise<CarePlanDto> {
    await this.requirePlanOwnsGoal(carePlanId, goalId);
    await this.repo.updateGoalStatus(goalId, carePlanId, status as any, user);
    return this.repo.findById(carePlanId) as Promise<CarePlanDto>;
  }

  async deleteGoal(carePlanId: string, goalId: string, user: string): Promise<CarePlanDto> {
    await this.requirePlanOwnsGoal(carePlanId, goalId);
    await this.repo.deleteGoal(goalId, carePlanId, user);
    return this.repo.findById(carePlanId) as Promise<CarePlanDto>;
  }

  // ── Interventions ─────────────────────────────────────────────────────────

  async addIntervention(
    carePlanId: string,
    goalId: string,
    dto: UpsertInterventionDto,
    user: string,
  ): Promise<CarePlanDto> {
    await this.requirePlanOwnsGoal(carePlanId, goalId);
    await this.repo.addIntervention(goalId, carePlanId, dto, user);
    return this.repo.findById(carePlanId) as Promise<CarePlanDto>;
  }

  async updateIntervention(
    carePlanId: string,
    interventionId: string,
    dto: UpsertInterventionDto,
    user: string,
  ): Promise<CarePlanDto> {
    await this.requirePlanOwnsEntity(carePlanId, async () => {
      const owner = await this.repo.findInterventionOwner(interventionId);
      return owner?.carePlanId === carePlanId;
    });
    await this.repo.updateIntervention(interventionId, carePlanId, dto, user);
    return this.repo.findById(carePlanId) as Promise<CarePlanDto>;
  }

  async deleteIntervention(
    carePlanId: string,
    interventionId: string,
    user: string,
  ): Promise<CarePlanDto> {
    await this.requirePlanOwnsEntity(carePlanId, async () => {
      const owner = await this.repo.findInterventionOwner(interventionId);
      return owner?.carePlanId === carePlanId;
    });
    await this.repo.deleteIntervention(interventionId, carePlanId, user);
    return this.repo.findById(carePlanId) as Promise<CarePlanDto>;
  }

  // ── Progress ──────────────────────────────────────────────────────────────

  async recordProgress(
    carePlanId: string,
    dto: RecordProgressDto,
    user: string,
    role: string,
  ): Promise<CarePlanProgressDto> {
    await this.requirePlan(carePlanId);

    // ESCALATION entries are restricted to clinical roles.
    if (dto.progressType === 'ESCALATION' && !ESCALATION_ROLES.has(role)) {
      throw new ForbiddenException(
        'Only clinician-authorised roles may record escalation entries.',
      );
    }

    return this.repo.recordProgress(carePlanId, dto, user);
  }

  async getProgress(carePlanId: string): Promise<CarePlanProgressDto[]> {
    await this.requirePlan(carePlanId);
    return this.repo.findProgress(carePlanId);
  }

  // ── CDSE integration ──────────────────────────────────────────────────────

  async getCdseSuggestions(carePlanId: string): Promise<CdseGoalSuggestionDto[]> {
    const plan = await this.requirePlan(carePlanId);
    const cdsResponse = await this.cdse.evaluate(plan.citizenId);

    const suggestions = await Promise.all(
      cdsResponse.recommendations.map(async (rec) => {
        const mapping = CDSE_RULE_MAP[rec.ruleId];
        const alreadyAccepted = await this.repo.goalExistsForRule(carePlanId, rec.ruleId);
        const lastDecisionRow = await this.repo.findLastCdseDecision(carePlanId, rec.ruleId);

        return {
          cdseRuleId: rec.ruleId,
          title: mapping?.goalTitle ?? rec.title,
          description: mapping?.description ?? rec.explanation,
          targetValue: mapping?.targetValue ?? null,
          category: (mapping?.category ?? 'CLINICAL') as GoalCategory,
          priority: (mapping?.priority ?? 'ROUTINE') as GoalPriority,
          cdsePriority: rec.priority,
          alreadyAccepted,
          lastDecision: lastDecisionRow?.decision ?? null,
          lastDeclineReason: lastDecisionRow?.declineReason ?? null,
        } satisfies CdseGoalSuggestionDto;
      }),
    );

    return suggestions;
  }

  async recordCdseDecisions(
    carePlanId: string,
    bulk: BulkCdseDecisionsDto,
    user: string,
  ): Promise<CdseDecisionResultDto> {
    const plan = await this.requirePlan(carePlanId);
    const goalsCreated: CarePlanGoalDto[] = [];

    for (const entry of bulk.decisions) {
      const decisionId = await this.repo.recordCdseDecision(
        carePlanId,
        plan.citizenId,
        entry.cdseRuleId,
        entry.recommendationTitle,
        entry.decision,
        entry.declineReason?.trim() ?? null,
        user,
      );

      if (entry.decision === 'ACCEPTED') {
        // Only create a goal if one doesn't already exist for this rule.
        const alreadyExists = await this.repo.goalExistsForRule(carePlanId, entry.cdseRuleId);
        if (!alreadyExists) {
          const goal = await this.createGoalFromCdseRule(
            carePlanId,
            entry.cdseRuleId,
            entry.recommendationTitle,
            entry.problemId ?? null,
            user,
          );
          if (goal) {
            goalsCreated.push(goal);
            await this.repo.linkGoalToDecision(decisionId, goal.id);
          }
        }
      }
    }

    return { recorded: bulk.decisions.length, goalsCreated };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async requirePlan(carePlanId: string): Promise<CarePlanDto> {
    const plan = await this.repo.findById(carePlanId);
    if (!plan) throw new NotFoundException('Care plan not found.');
    return plan;
  }

  private async requirePlanOwnsEntity(
    carePlanId: string,
    check: () => Promise<boolean>,
  ): Promise<void> {
    const owned = await check();
    if (!owned) {
      throw new NotFoundException('Resource not found in this care plan.');
    }
  }

  private async requirePlanOwnsGoal(carePlanId: string, goalId: string): Promise<void> {
    return this.requirePlanOwnsEntity(carePlanId, async () => {
      const owner = await this.repo.findGoalOwner(goalId);
      return owner?.carePlanId === carePlanId;
    });
  }

  private async createGoalFromCdseRule(
    carePlanId: string,
    ruleId: string,
    fallbackTitle: string,
    providedProblemId: string | null,
    user: string,
  ): Promise<CarePlanGoalDto | null> {
    const mapping = CDSE_RULE_MAP[ruleId];
    const goalTitle = mapping?.goalTitle ?? fallbackTitle;

    let problemId = providedProblemId;

    // If no problem was specified, create one from the CDSE rule mapping.
    if (!problemId) {
      const problemDto: UpsertProblemDto = {
        title: mapping?.problemTitle ?? `Problem: ${goalTitle}`,
        status: 'ACTIVE',
      };
      problemId = await this.repo.addProblem(carePlanId, problemDto, null, user);
    }

    const goalDto: UpsertGoalDto = {
      title: goalTitle,
      description: mapping?.description,
      targetValue: mapping?.targetValue ?? undefined,
      category: mapping?.category ?? 'CLINICAL',
      priority: mapping?.priority ?? 'ROUTINE',
      status: 'ACTIVE',
      cdseRuleId: ruleId,
    };

    return this.repo.addGoal(problemId, carePlanId, goalDto, user);
  }
}
