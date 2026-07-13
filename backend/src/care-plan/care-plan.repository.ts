import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  CarePlanDto,
  CarePlanGoalDto,
  CarePlanInterventionDto,
  CarePlanProblemDto,
  CarePlanProgressDto,
  CarePlanSummaryDto,
  CdseDecision,
  GoalCategory,
  GoalPriority,
  GoalStatus,
  InterventionStatus,
  ProblemStatus,
  ProgressType,
} from './care-plan.types';
import type { CreateCarePlanDto } from './dto/create-care-plan.dto';
import type { UpdateCarePlanDto } from './dto/update-care-plan.dto';
import type { UpsertProblemDto } from './dto/upsert-problem.dto';
import type { UpsertGoalDto } from './dto/upsert-goal.dto';
import type { UpsertInterventionDto } from './dto/upsert-intervention.dto';
import type { RecordProgressDto } from './dto/record-progress.dto';

// ── Raw DB row shapes ─────────────────────────────────────────────────────────

interface PlanRow {
  id: string;
  citizen_id: string;
  citizen_name: string | null;
  status: string;
  title: string;
  summary: string | null;
  created_by: string;
  last_reviewed_by: string | null;
  last_reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ProblemRow {
  id: string;
  care_plan_id: string;
  enrollment_id: string | null;
  program_id: string | null;
  program_name: string | null;
  title: string;
  description: string | null;
  identified_date: Date | null;
  status: string;
  sort_order: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface GoalRow {
  id: string;
  problem_id: string;
  care_plan_id: string;
  title: string;
  description: string | null;
  target_value: string | null;
  target_date: Date | null;
  category: string;
  status: string;
  priority: string;
  cdse_rule_id: string | null;
  sort_order: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface InterventionRow {
  id: string;
  goal_id: string;
  care_plan_id: string;
  title: string;
  description: string | null;
  frequency: string | null;
  responsible: string | null;
  status: string;
  assigned_by: string | null;
  assigned_to: string | null;
  due_date: Date | null;
  completed_by: string | null;
  completed_date: Date | null;
  sort_order: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface ProgressRow {
  id: string;
  care_plan_id: string;
  goal_id: string | null;
  goal_title: string | null;
  problem_title: string | null;
  worklist_item_id: string | null;
  outcome_record_id: string | null;
  progress_note: string;
  progress_type: string;
  recorded_by: string;
  recorded_at: Date;
}

interface SummaryRow {
  id: string;
  citizen_id: string;
  status: string;
  title: string;
  summary: string | null;
  last_reviewed_at: Date | null;
  updated_at: Date;
  total_problems: string;
  active_problems: string;
  active_goals: string;
  achieved_goals: string;
}

interface DecisionRow {
  id: string;
  care_plan_id: string;
  citizen_id: string;
  cdse_rule_id: string;
  recommendation_title: string;
  decision: string;
  decline_reason: string | null;
  goal_id: string | null;
  decided_by: string;
  decided_at: Date;
}

/**
 * Data-access layer for the Longitudinal Care Plan Engine.
 *
 * On startup: creates the five care-plan tables and their indexes if they do
 * not exist yet (idempotent — safe to run on every server start).
 */
@Injectable()
export class CarePlanRepository implements OnModuleInit {
  private readonly logger = new Logger(CarePlanRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.migrate();
  }

  // ── DDL migration ─────────────────────────────────────────────────────────

  private async migrate(): Promise<void> {
    try {
      // 1. care_plans — citizen-centric, one per citizen
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS dinc_app.care_plans (
          id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          citizen_id       UUID        NOT NULL UNIQUE
                             /* TODO(Step 2+): restore FK to migrated dinc_runtime/dinc_metadata table */,
          status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                             CHECK (status IN ('DRAFT','ACTIVE','COMPLETED','SUSPENDED')),
          title            TEXT        NOT NULL,
          summary          TEXT,
          created_by       TEXT        NOT NULL,
          last_reviewed_by TEXT,
          last_reviewed_at TIMESTAMPTZ,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_care_plans_status
          ON dinc_app.care_plans (citizen_id, status)
      `);

      // 2. care_plan_problems — health problems identified for the citizen
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS dinc_app.care_plan_problems (
          id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          care_plan_id    UUID        NOT NULL
                            REFERENCES dinc_app.care_plans(id) ON DELETE CASCADE,
          enrollment_id   UUID
                            /* TODO(Step 2+): restore FK to migrated dinc_runtime/dinc_metadata table */,
          program_id      UUID
                            /* TODO(Step 2+): restore FK to migrated dinc_runtime/dinc_metadata table */,
          title           TEXT        NOT NULL,
          description     TEXT,
          identified_date DATE,
          status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE','RESOLVED','MONITORING','DEFERRED')),
          sort_order      INT         NOT NULL DEFAULT 0,
          created_by      TEXT        NOT NULL,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_care_plan_problems_plan
          ON dinc_app.care_plan_problems (care_plan_id, sort_order)
      `);

      // 3. care_plan_goals — goals linked to a problem
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS dinc_app.care_plan_goals (
          id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          problem_id    UUID        NOT NULL
                          REFERENCES dinc_app.care_plan_problems(id) ON DELETE CASCADE,
          care_plan_id  UUID        NOT NULL
                          REFERENCES dinc_app.care_plans(id) ON DELETE CASCADE,
          title         TEXT        NOT NULL,
          description   TEXT,
          target_value  TEXT,
          target_date   DATE,
          category      VARCHAR(30) NOT NULL DEFAULT 'CLINICAL'
                          CHECK (category IN
                            ('CLINICAL','LIFESTYLE','MEDICATION','EDUCATION','REFERRAL')),
          status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN
                            ('ACTIVE','ACHIEVED','PARTIAL','NOT_ACHIEVED','DEFERRED')),
          priority      VARCHAR(10) NOT NULL DEFAULT 'ROUTINE'
                          CHECK (priority IN ('CRITICAL','HIGH','ROUTINE')),
          cdse_rule_id  TEXT,
          sort_order    INT         NOT NULL DEFAULT 0,
          created_by    TEXT        NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_care_plan_goals_problem
          ON dinc_app.care_plan_goals (problem_id, sort_order)
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_care_plan_goals_plan
          ON dinc_app.care_plan_goals (care_plan_id)
      `);

      // 4. care_plan_interventions — actions linked to a goal
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS dinc_app.care_plan_interventions (
          id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          goal_id         UUID        NOT NULL
                            REFERENCES dinc_app.care_plan_goals(id) ON DELETE CASCADE,
          care_plan_id    UUID        NOT NULL
                            REFERENCES dinc_app.care_plans(id) ON DELETE CASCADE,
          title           TEXT        NOT NULL,
          description     TEXT,
          frequency       TEXT,
          responsible     TEXT,
          status          VARCHAR(20) NOT NULL DEFAULT 'PLANNED'
                            CHECK (status IN
                              ('PLANNED','ONGOING','COMPLETED','DISCONTINUED')),
          assigned_by     TEXT,
          assigned_to     TEXT,
          due_date        DATE,
          completed_by    TEXT,
          completed_date  DATE,
          sort_order      INT         NOT NULL DEFAULT 0,
          created_by      TEXT        NOT NULL,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_care_plan_interventions_goal
          ON dinc_app.care_plan_interventions (goal_id, sort_order)
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_care_plan_interventions_plan
          ON dinc_app.care_plan_interventions (care_plan_id)
      `);

      // 5. care_plan_progress — longitudinal progress entries
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS dinc_app.care_plan_progress (
          id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          care_plan_id      UUID        NOT NULL
                              REFERENCES dinc_app.care_plans(id) ON DELETE CASCADE,
          goal_id           UUID
                              REFERENCES dinc_app.care_plan_goals(id) ON DELETE SET NULL,
          worklist_item_id  UUID
                              /* TODO(Step 2+): restore FK to migrated dinc_runtime/dinc_metadata table */,
          outcome_record_id UUID
                              /* TODO(Step 2+): restore FK to migrated dinc_runtime/dinc_metadata table */,
          progress_note     TEXT        NOT NULL,
          progress_type     VARCHAR(20) NOT NULL DEFAULT 'UPDATE'
                              CHECK (progress_type IN
                                ('ASSESSMENT','UPDATE','REVIEW','ESCALATION','ACHIEVEMENT')),
          recorded_by       TEXT        NOT NULL,
          recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_care_plan_progress_plan
          ON dinc_app.care_plan_progress (care_plan_id, recorded_at DESC)
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_care_plan_progress_goal
          ON dinc_app.care_plan_progress (goal_id, recorded_at DESC)
          WHERE goal_id IS NOT NULL
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_care_plan_progress_worklist
          ON dinc_app.care_plan_progress (worklist_item_id)
          WHERE worklist_item_id IS NOT NULL
      `);

      // 6. cdse_recommendation_decisions — CDSE accept / decline audit
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS dinc_app.cdse_recommendation_decisions (
          id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          care_plan_id          UUID        NOT NULL
                                  REFERENCES dinc_app.care_plans(id) ON DELETE CASCADE,
          citizen_id            UUID        NOT NULL
                                  /* TODO(Step 2+): restore FK to migrated dinc_runtime/dinc_metadata table */,
          cdse_rule_id          TEXT        NOT NULL,
          recommendation_title  TEXT        NOT NULL,
          decision              VARCHAR(10) NOT NULL
                                  CHECK (decision IN ('ACCEPTED','DECLINED')),
          decline_reason        TEXT,
          goal_id               UUID
                                  REFERENCES dinc_app.care_plan_goals(id) ON DELETE SET NULL,
          decided_by            TEXT        NOT NULL,
          decided_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_cdse_decisions_care_plan
          ON dinc_app.cdse_recommendation_decisions (care_plan_id, decided_at DESC)
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_cdse_decisions_rule
          ON dinc_app.cdse_recommendation_decisions (care_plan_id, cdse_rule_id)
      `);

      this.logger.log('Care plan tables ready.');
    } catch (err) {
      this.logger.error('Care plan migration failed', err);
      throw err;
    }
  }

  // ── Care Plan reads ───────────────────────────────────────────────────────

  async findByCitizenId(citizenId: string): Promise<CarePlanDto | null> {
    const planRes = await this.db.query<PlanRow>(`
      SELECT cp.*, c.full_name AS citizen_name
      FROM   dinc_app.care_plans cp
      JOIN   public.citizens c ON c.id = cp.citizen_id
      WHERE  cp.citizen_id = $1
    `, [citizenId]);

    if (!planRes.rows[0]) return null;
    const plan = planRes.rows[0];

    const [problemRes, goalRes, interventionRes] = await Promise.all([
      this.db.query<ProblemRow>(`
        SELECT pp.*, p.name AS program_name
        FROM   dinc_app.care_plan_problems pp
        LEFT JOIN public.programs p ON p.id = pp.program_id
        WHERE  pp.care_plan_id = $1
        ORDER BY pp.sort_order, pp.created_at
      `, [plan.id]),

      this.db.query<GoalRow>(`
        SELECT * FROM dinc_app.care_plan_goals
        WHERE  care_plan_id = $1
        ORDER  BY sort_order, created_at
      `, [plan.id]),

      this.db.query<InterventionRow>(`
        SELECT * FROM dinc_app.care_plan_interventions
        WHERE  care_plan_id = $1
        ORDER  BY sort_order, created_at
      `, [plan.id]),
    ]);

    return this.assemblePlan(plan, problemRes.rows, goalRes.rows, interventionRes.rows);
  }

  async findIdByCitizenId(citizenId: string): Promise<string | null> {
    const res = await this.db.query<{ id: string }>(
      'SELECT id FROM dinc_app.care_plans WHERE citizen_id = $1',
      [citizenId],
    );
    return res.rows[0]?.id ?? null;
  }

  async findById(carePlanId: string): Promise<CarePlanDto | null> {
    const planRes = await this.db.query<PlanRow>(`
      SELECT cp.*, c.full_name AS citizen_name
      FROM   dinc_app.care_plans cp
      JOIN   public.citizens c ON c.id = cp.citizen_id
      WHERE  cp.id = $1
    `, [carePlanId]);

    if (!planRes.rows[0]) return null;
    const plan = planRes.rows[0];

    const [problemRes, goalRes, interventionRes] = await Promise.all([
      this.db.query<ProblemRow>(`
        SELECT pp.*, p.name AS program_name
        FROM   dinc_app.care_plan_problems pp
        LEFT JOIN public.programs p ON p.id = pp.program_id
        WHERE  pp.care_plan_id = $1
        ORDER BY pp.sort_order, pp.created_at
      `, [plan.id]),

      this.db.query<GoalRow>(`
        SELECT * FROM dinc_app.care_plan_goals
        WHERE  care_plan_id = $1
        ORDER  BY sort_order, created_at
      `, [plan.id]),

      this.db.query<InterventionRow>(`
        SELECT * FROM dinc_app.care_plan_interventions
        WHERE  care_plan_id = $1
        ORDER  BY sort_order, created_at
      `, [plan.id]),
    ]);

    return this.assemblePlan(plan, problemRes.rows, goalRes.rows, interventionRes.rows);
  }

  async findSummaryByCitizenId(citizenId: string): Promise<CarePlanSummaryDto | null> {
    const res = await this.db.query<SummaryRow>(`
      SELECT
        cp.id, cp.citizen_id, cp.status, cp.title, cp.summary,
        cp.last_reviewed_at, cp.updated_at,
        COUNT(DISTINCT prob.id)                                           AS total_problems,
        COUNT(DISTINCT prob.id) FILTER (WHERE prob.status = 'ACTIVE')    AS active_problems,
        COUNT(DISTINCT g.id)    FILTER (WHERE g.status = 'ACTIVE')       AS active_goals,
        COUNT(DISTINCT g.id)    FILTER (WHERE g.status = 'ACHIEVED')     AS achieved_goals
      FROM  dinc_app.care_plans cp
      LEFT JOIN dinc_app.care_plan_problems prob ON prob.care_plan_id = cp.id
      LEFT JOIN dinc_app.care_plan_goals g       ON g.care_plan_id = cp.id
      WHERE cp.citizen_id = $1
      GROUP BY cp.id
    `, [citizenId]);

    if (!res.rows[0]) return null;
    return this.mapSummary(res.rows[0]);
  }

  // ── Care Plan writes ──────────────────────────────────────────────────────

  async create(citizenId: string, dto: CreateCarePlanDto, user: string): Promise<string> {
    const res = await this.db.query<{ id: string }>(`
      INSERT INTO dinc_app.care_plans (citizen_id, title, summary, status, created_by)
      VALUES ($1, $2, $3, 'DRAFT', $4)
      RETURNING id
    `, [citizenId, dto.title.trim(), dto.summary?.trim() ?? null, user]);
    return res.rows[0].id;
  }

  async update(carePlanId: string, dto: UpdateCarePlanDto, user: string): Promise<void> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let i = 1;

    if (dto.title !== undefined)   { sets.push(`title = $${i++}`);   params.push(dto.title.trim()); }
    if (dto.summary !== undefined) { sets.push(`summary = $${i++}`); params.push(dto.summary.trim() || null); }
    if (dto.status !== undefined)  { sets.push(`status = $${i++}`);  params.push(dto.status); }

    if (sets.length === 1) return; // nothing to update

    sets.push(`last_reviewed_by = $${i++}`, `last_reviewed_at = NOW()`);
    params.push(user);
    params.push(carePlanId);

    await this.db.query(
      `UPDATE dinc_app.care_plans SET ${sets.join(', ')} WHERE id = $${i}`,
      params,
    );
  }

  // ── Problem writes ────────────────────────────────────────────────────────

  async addProblem(
    carePlanId: string,
    dto: UpsertProblemDto,
    programId: string | null,
    user: string,
  ): Promise<string> {
    const sortRes = await this.db.query<{ max: number | null }>(
      'SELECT MAX(sort_order) AS max FROM dinc_app.care_plan_problems WHERE care_plan_id = $1',
      [carePlanId],
    );
    const nextOrder = (sortRes.rows[0]?.max ?? -1) + 1;

    const res = await this.db.query<{ id: string }>(`
      INSERT INTO dinc_app.care_plan_problems
        (care_plan_id, enrollment_id, program_id, title, description,
         identified_date, status, sort_order, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      carePlanId,
      dto.enrollmentId ?? null,
      programId,
      dto.title.trim(),
      dto.description?.trim() ?? null,
      dto.identifiedDate ?? null,
      dto.status ?? 'ACTIVE',
      nextOrder,
      user,
    ]);

    await this.touchPlan(carePlanId, user);
    return res.rows[0].id;
  }

  async updateProblem(problemId: string, carePlanId: string, dto: UpsertProblemDto, user: string): Promise<void> {
    await this.db.query(`
      UPDATE dinc_app.care_plan_problems
      SET title           = $1,
          description     = $2,
          enrollment_id   = $3,
          identified_date = $4,
          status          = $5,
          updated_at      = NOW()
      WHERE id = $6 AND care_plan_id = $7
    `, [
      dto.title.trim(),
      dto.description?.trim() ?? null,
      dto.enrollmentId ?? null,
      dto.identifiedDate ?? null,
      dto.status ?? 'ACTIVE',
      problemId,
      carePlanId,
    ]);
    await this.touchPlan(carePlanId, user);
  }

  async deleteProblem(problemId: string, carePlanId: string, user: string): Promise<void> {
    await this.db.query(
      'DELETE FROM dinc_app.care_plan_problems WHERE id = $1 AND care_plan_id = $2',
      [problemId, carePlanId],
    );
    await this.touchPlan(carePlanId, user);
  }

  async findProblemOwner(problemId: string): Promise<string | null> {
    const res = await this.db.query<{ care_plan_id: string }>(
      'SELECT care_plan_id FROM dinc_app.care_plan_problems WHERE id = $1',
      [problemId],
    );
    return res.rows[0]?.care_plan_id ?? null;
  }

  async findProblemProgramId(enrollmentId: string): Promise<string | null> {
    const res = await this.db.query<{ program_id: string }>(
      'SELECT program_id FROM public.enrollments WHERE id = $1',
      [enrollmentId],
    );
    return res.rows[0]?.program_id ?? null;
  }

  // ── Goal writes ───────────────────────────────────────────────────────────

  async addGoal(problemId: string, carePlanId: string, dto: UpsertGoalDto, user: string): Promise<CarePlanGoalDto> {
    const sortRes = await this.db.query<{ max: number | null }>(
      'SELECT MAX(sort_order) AS max FROM dinc_app.care_plan_goals WHERE problem_id = $1',
      [problemId],
    );
    const nextOrder = (sortRes.rows[0]?.max ?? -1) + 1;

    const res = await this.db.query<GoalRow>(`
      INSERT INTO dinc_app.care_plan_goals
        (problem_id, care_plan_id, title, description, target_value, target_date,
         category, status, priority, cdse_rule_id, sort_order, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      problemId,
      carePlanId,
      dto.title.trim(),
      dto.description?.trim() ?? null,
      dto.targetValue?.trim() ?? null,
      dto.targetDate ?? null,
      dto.category,
      dto.status ?? 'ACTIVE',
      dto.priority,
      dto.cdseRuleId ?? null,
      nextOrder,
      user,
    ]);

    await this.touchPlan(carePlanId, user);
    return this.mapGoal(res.rows[0], []);
  }

  async updateGoal(goalId: string, carePlanId: string, dto: UpsertGoalDto, user: string): Promise<void> {
    await this.db.query(`
      UPDATE dinc_app.care_plan_goals
      SET title        = $1,
          description  = $2,
          target_value = $3,
          target_date  = $4,
          category     = $5,
          status       = $6,
          priority     = $7,
          updated_at   = NOW()
      WHERE id = $8 AND care_plan_id = $9
    `, [
      dto.title.trim(),
      dto.description?.trim() ?? null,
      dto.targetValue?.trim() ?? null,
      dto.targetDate ?? null,
      dto.category,
      dto.status ?? 'ACTIVE',
      dto.priority,
      goalId,
      carePlanId,
    ]);
    await this.touchPlan(carePlanId, user);
  }

  async updateGoalStatus(goalId: string, carePlanId: string, status: GoalStatus, user: string): Promise<void> {
    await this.db.query(
      'UPDATE dinc_app.care_plan_goals SET status = $1, updated_at = NOW() WHERE id = $2 AND care_plan_id = $3',
      [status, goalId, carePlanId],
    );
    await this.touchPlan(carePlanId, user);
  }

  async deleteGoal(goalId: string, carePlanId: string, user: string): Promise<void> {
    await this.db.query(
      'DELETE FROM dinc_app.care_plan_goals WHERE id = $1 AND care_plan_id = $2',
      [goalId, carePlanId],
    );
    await this.touchPlan(carePlanId, user);
  }

  async findGoalOwner(goalId: string): Promise<{ carePlanId: string; problemId: string } | null> {
    const res = await this.db.query<{ care_plan_id: string; problem_id: string }>(
      'SELECT care_plan_id, problem_id FROM dinc_app.care_plan_goals WHERE id = $1',
      [goalId],
    );
    if (!res.rows[0]) return null;
    return { carePlanId: res.rows[0].care_plan_id, problemId: res.rows[0].problem_id };
  }

  async goalExistsForRule(carePlanId: string, cdseRuleId: string): Promise<boolean> {
    const res = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM dinc_app.care_plan_goals WHERE care_plan_id = $1 AND cdse_rule_id = $2',
      [carePlanId, cdseRuleId],
    );
    return parseInt(res.rows[0]?.count ?? '0', 10) > 0;
  }

  async linkGoalToDecision(decisionId: string, goalId: string): Promise<void> {
    await this.db.query(
      'UPDATE dinc_app.cdse_recommendation_decisions SET goal_id = $1 WHERE id = $2',
      [goalId, decisionId],
    );
  }

  // ── Intervention writes ───────────────────────────────────────────────────

  async addIntervention(
    goalId: string,
    carePlanId: string,
    dto: UpsertInterventionDto,
    user: string,
  ): Promise<CarePlanInterventionDto> {
    const sortRes = await this.db.query<{ max: number | null }>(
      'SELECT MAX(sort_order) AS max FROM dinc_app.care_plan_interventions WHERE goal_id = $1',
      [goalId],
    );
    const nextOrder = (sortRes.rows[0]?.max ?? -1) + 1;

    const res = await this.db.query<InterventionRow>(`
      INSERT INTO dinc_app.care_plan_interventions
        (goal_id, care_plan_id, title, description, frequency, responsible,
         status, assigned_by, assigned_to, due_date, completed_by, completed_date,
         sort_order, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      goalId,
      carePlanId,
      dto.title.trim(),
      dto.description?.trim() ?? null,
      dto.frequency?.trim() ?? null,
      dto.responsible?.trim() ?? null,
      dto.status ?? 'PLANNED',
      dto.assignedBy?.trim() ?? null,
      dto.assignedTo?.trim() ?? null,
      dto.dueDate ?? null,
      dto.completedBy?.trim() ?? null,
      dto.completedDate ?? null,
      nextOrder,
      user,
    ]);

    await this.touchPlan(carePlanId, user);
    return this.mapIntervention(res.rows[0]);
  }

  async updateIntervention(
    interventionId: string,
    carePlanId: string,
    dto: UpsertInterventionDto,
    user: string,
  ): Promise<void> {
    await this.db.query(`
      UPDATE dinc_app.care_plan_interventions
      SET title          = $1,
          description    = $2,
          frequency      = $3,
          responsible    = $4,
          status         = $5,
          assigned_by    = $6,
          assigned_to    = $7,
          due_date       = $8,
          completed_by   = $9,
          completed_date = $10,
          updated_at     = NOW()
      WHERE id = $11 AND care_plan_id = $12
    `, [
      dto.title.trim(),
      dto.description?.trim() ?? null,
      dto.frequency?.trim() ?? null,
      dto.responsible?.trim() ?? null,
      dto.status ?? 'PLANNED',
      dto.assignedBy?.trim() ?? null,
      dto.assignedTo?.trim() ?? null,
      dto.dueDate ?? null,
      dto.completedBy?.trim() ?? null,
      dto.completedDate ?? null,
      interventionId,
      carePlanId,
    ]);
    await this.touchPlan(carePlanId, user);
  }

  async deleteIntervention(interventionId: string, carePlanId: string, user: string): Promise<void> {
    await this.db.query(
      'DELETE FROM dinc_app.care_plan_interventions WHERE id = $1 AND care_plan_id = $2',
      [interventionId, carePlanId],
    );
    await this.touchPlan(carePlanId, user);
  }

  async findInterventionOwner(interventionId: string): Promise<{ carePlanId: string; goalId: string } | null> {
    const res = await this.db.query<{ care_plan_id: string; goal_id: string }>(
      'SELECT care_plan_id, goal_id FROM dinc_app.care_plan_interventions WHERE id = $1',
      [interventionId],
    );
    if (!res.rows[0]) return null;
    return { carePlanId: res.rows[0].care_plan_id, goalId: res.rows[0].goal_id };
  }

  // ── Progress writes / reads ───────────────────────────────────────────────

  async recordProgress(
    carePlanId: string,
    dto: RecordProgressDto,
    user: string,
  ): Promise<CarePlanProgressDto> {
    const res = await this.db.query<{ id: string; recorded_at: Date }>(`
      INSERT INTO dinc_app.care_plan_progress
        (care_plan_id, goal_id, worklist_item_id, outcome_record_id,
         progress_note, progress_type, recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, recorded_at
    `, [
      carePlanId,
      dto.goalId ?? null,
      dto.worklistItemId ?? null,
      dto.outcomeRecordId ?? null,
      dto.progressNote.trim(),
      dto.progressType,
      user,
    ]);

    await this.touchPlan(carePlanId, user);

    // Return the newly inserted entry with joined titles
    const full = await this.db.query<ProgressRow>(`
      SELECT
        cp.id, cp.care_plan_id, cp.goal_id,
        g.title           AS goal_title,
        prob.title        AS problem_title,
        cp.worklist_item_id, cp.outcome_record_id,
        cp.progress_note, cp.progress_type,
        cp.recorded_by, cp.recorded_at
      FROM  dinc_app.care_plan_progress cp
      LEFT JOIN dinc_app.care_plan_goals g    ON g.id    = cp.goal_id
      LEFT JOIN dinc_app.care_plan_problems prob ON prob.id = g.problem_id
      WHERE cp.id = $1
    `, [res.rows[0].id]);

    return this.mapProgress(full.rows[0]);
  }

  async findProgress(carePlanId: string): Promise<CarePlanProgressDto[]> {
    const res = await this.db.query<ProgressRow>(`
      SELECT
        cp.id, cp.care_plan_id, cp.goal_id,
        g.title           AS goal_title,
        prob.title        AS problem_title,
        cp.worklist_item_id, cp.outcome_record_id,
        cp.progress_note, cp.progress_type,
        cp.recorded_by, cp.recorded_at
      FROM  dinc_app.care_plan_progress cp
      LEFT JOIN dinc_app.care_plan_goals g       ON g.id    = cp.goal_id
      LEFT JOIN dinc_app.care_plan_problems prob ON prob.id = g.problem_id
      WHERE cp.care_plan_id = $1
      ORDER BY cp.recorded_at DESC
      LIMIT 200
    `, [carePlanId]);

    return res.rows.map((r) => this.mapProgress(r));
  }

  // ── CDSE decision writes / reads ──────────────────────────────────────────

  async recordCdseDecision(
    carePlanId: string,
    citizenId: string,
    cdseRuleId: string,
    recommendationTitle: string,
    decision: CdseDecision,
    declineReason: string | null,
    user: string,
  ): Promise<string> {
    const res = await this.db.query<{ id: string }>(`
      INSERT INTO dinc_app.cdse_recommendation_decisions
        (care_plan_id, citizen_id, cdse_rule_id, recommendation_title,
         decision, decline_reason, decided_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
    `, [carePlanId, citizenId, cdseRuleId, recommendationTitle, decision, declineReason, user]);
    return res.rows[0].id;
  }

  async findLastCdseDecision(
    carePlanId: string,
    cdseRuleId: string,
  ): Promise<{ decision: CdseDecision; declineReason: string | null } | null> {
    const res = await this.db.query<DecisionRow>(`
      SELECT decision, decline_reason
      FROM   dinc_app.cdse_recommendation_decisions
      WHERE  care_plan_id = $1 AND cdse_rule_id = $2
      ORDER  BY decided_at DESC
      LIMIT  1
    `, [carePlanId, cdseRuleId]);

    if (!res.rows[0]) return null;
    return {
      decision: res.rows[0].decision as CdseDecision,
      declineReason: res.rows[0].decline_reason,
    };
  }

  // ── Ownership / auth helpers ──────────────────────────────────────────────

  async findCarePlanCitizenId(carePlanId: string): Promise<string | null> {
    const res = await this.db.query<{ citizen_id: string }>(
      'SELECT citizen_id FROM dinc_app.care_plans WHERE id = $1',
      [carePlanId],
    );
    return res.rows[0]?.citizen_id ?? null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async touchPlan(carePlanId: string, user: string): Promise<void> {
    await this.db.query(
      'UPDATE dinc_app.care_plans SET updated_at = NOW(), last_reviewed_by = $1, last_reviewed_at = NOW() WHERE id = $2',
      [user, carePlanId],
    );
  }

  private assemblePlan(
    plan: PlanRow,
    problems: ProblemRow[],
    goals: GoalRow[],
    interventions: InterventionRow[],
  ): CarePlanDto {
    const goalsByProblem = new Map<string, GoalRow[]>();
    for (const g of goals) {
      const list = goalsByProblem.get(g.problem_id) ?? [];
      list.push(g);
      goalsByProblem.set(g.problem_id, list);
    }

    const interventionsByGoal = new Map<string, InterventionRow[]>();
    for (const iv of interventions) {
      const list = interventionsByGoal.get(iv.goal_id) ?? [];
      list.push(iv);
      interventionsByGoal.set(iv.goal_id, list);
    }

    const mappedProblems: CarePlanProblemDto[] = problems.map((prob) => {
      const probGoals = goalsByProblem.get(prob.id) ?? [];
      const mappedGoals: CarePlanGoalDto[] = probGoals.map((g) =>
        this.mapGoal(g, interventionsByGoal.get(g.id) ?? []),
      );
      return this.mapProblem(prob, mappedGoals);
    });

    return {
      id: plan.id,
      citizenId: plan.citizen_id,
      citizenName: plan.citizen_name,
      status: plan.status as any,
      title: plan.title,
      summary: plan.summary,
      createdBy: plan.created_by,
      lastReviewedBy: plan.last_reviewed_by,
      lastReviewedAt: plan.last_reviewed_at?.toISOString() ?? null,
      createdAt: plan.created_at.toISOString(),
      updatedAt: plan.updated_at.toISOString(),
      problems: mappedProblems,
    };
  }

  private mapProblem(row: ProblemRow, goals: CarePlanGoalDto[]): CarePlanProblemDto {
    return {
      id: row.id,
      carePlanId: row.care_plan_id,
      enrollmentId: row.enrollment_id,
      programId: row.program_id,
      programName: row.program_name,
      title: row.title,
      description: row.description,
      identifiedDate: row.identified_date
        ? row.identified_date.toISOString().split('T')[0]
        : null,
      status: row.status as ProblemStatus,
      sortOrder: row.sort_order,
      goals,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapGoal(row: GoalRow, interventions: InterventionRow[]): CarePlanGoalDto {
    return {
      id: row.id,
      problemId: row.problem_id,
      carePlanId: row.care_plan_id,
      title: row.title,
      description: row.description,
      targetValue: row.target_value,
      targetDate: row.target_date ? row.target_date.toISOString().split('T')[0] : null,
      category: row.category as GoalCategory,
      status: row.status as GoalStatus,
      priority: row.priority as GoalPriority,
      cdseRuleId: row.cdse_rule_id,
      sortOrder: row.sort_order,
      interventions: interventions.map((iv) => this.mapIntervention(iv)),
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapIntervention(row: InterventionRow): CarePlanInterventionDto {
    return {
      id: row.id,
      goalId: row.goal_id,
      carePlanId: row.care_plan_id,
      title: row.title,
      description: row.description,
      frequency: row.frequency,
      responsible: row.responsible,
      status: row.status as InterventionStatus,
      assignedBy: row.assigned_by,
      assignedTo: row.assigned_to,
      dueDate: row.due_date ? row.due_date.toISOString().split('T')[0] : null,
      completedBy: row.completed_by,
      completedDate: row.completed_date
        ? row.completed_date.toISOString().split('T')[0]
        : null,
      sortOrder: row.sort_order,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapProgress(row: ProgressRow): CarePlanProgressDto {
    return {
      id: row.id,
      carePlanId: row.care_plan_id,
      goalId: row.goal_id,
      goalTitle: row.goal_title,
      problemTitle: row.problem_title,
      worklistItemId: row.worklist_item_id,
      outcomeRecordId: row.outcome_record_id,
      progressNote: row.progress_note,
      progressType: row.progress_type as ProgressType,
      recordedBy: row.recorded_by,
      recordedAt: row.recorded_at.toISOString(),
    };
  }

  private mapSummary(row: SummaryRow): CarePlanSummaryDto {
    return {
      id: row.id,
      citizenId: row.citizen_id,
      status: row.status as any,
      title: row.title,
      summary: row.summary,
      totalProblems: parseInt(row.total_problems, 10),
      activeProblems: parseInt(row.active_problems, 10),
      activeGoals: parseInt(row.active_goals, 10),
      achievedGoals: parseInt(row.achieved_goals, 10),
      lastReviewedAt: row.last_reviewed_at?.toISOString() ?? null,
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
