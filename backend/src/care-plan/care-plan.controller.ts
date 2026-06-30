import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CarePlanService } from './care-plan.service';
import type {
  CarePlanDto,
  CarePlanGoalDto,
  CarePlanProgressDto,
  CarePlanSummaryDto,
  CdseDecisionResultDto,
  CdseGoalSuggestionDto,
} from './care-plan.types';
import { BulkCdseDecisionsDto } from './dto/cdse-decisions.dto';
import { CreateCarePlanDto } from './dto/create-care-plan.dto';
import { RecordProgressDto } from './dto/record-progress.dto';
import { UpdateCarePlanDto } from './dto/update-care-plan.dto';
import { UpsertGoalDto } from './dto/upsert-goal.dto';
import { UpsertInterventionDto } from './dto/upsert-intervention.dto';
import { UpsertProblemDto } from './dto/upsert-problem.dto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * HTTP layer for the Longitudinal Care Plan Engine. Holds no SQL and no
 * business logic — validates path params, extracts the authenticated caller,
 * and delegates to CarePlanService. All routes are JWT-guarded.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class CarePlanController {
  constructor(private readonly carePlan: CarePlanService) {}

  // ── Care Plan endpoints ───────────────────────────────────────────────────

  @Get('citizens/:citizenId/care-plan')
  getForCitizen(
    @Param('citizenId') citizenId: string,
  ): Promise<CarePlanDto | null> {
    requireUuid(citizenId);
    return this.carePlan.getForCitizen(citizenId);
  }

  @Get('citizens/:citizenId/care-plan/summary')
  getSummary(
    @Param('citizenId') citizenId: string,
  ): Promise<CarePlanSummaryDto | null> {
    requireUuid(citizenId);
    return this.carePlan.getSummaryForCitizen(citizenId);
  }

  @Post('citizens/:citizenId/care-plan')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('citizenId') citizenId: string,
    @Body() body: CreateCarePlanDto,
    @Req() req: Request,
  ): Promise<CarePlanDto> {
    requireUuid(citizenId);
    return this.carePlan.create(citizenId, body, user(req));
  }

  @Put('care-plans/:id')
  updatePlan(
    @Param('id') id: string,
    @Body() body: UpdateCarePlanDto,
    @Req() req: Request,
  ): Promise<CarePlanDto> {
    requireUuid(id);
    return this.carePlan.update(id, body, user(req));
  }

  // ── Problem endpoints ─────────────────────────────────────────────────────

  @Post('care-plans/:id/problems')
  @HttpCode(HttpStatus.CREATED)
  addProblem(
    @Param('id') id: string,
    @Body() body: UpsertProblemDto,
    @Req() req: Request,
  ): Promise<CarePlanDto> {
    requireUuid(id);
    return this.carePlan.addProblem(id, body, user(req));
  }

  @Put('care-plans/:id/problems/:problemId')
  updateProblem(
    @Param('id') id: string,
    @Param('problemId') problemId: string,
    @Body() body: UpsertProblemDto,
    @Req() req: Request,
  ): Promise<CarePlanDto> {
    requireUuid(id);
    requireUuid(problemId);
    return this.carePlan.updateProblem(id, problemId, body, user(req));
  }

  @Delete('care-plans/:id/problems/:problemId')
  @HttpCode(HttpStatus.OK)
  deleteProblem(
    @Param('id') id: string,
    @Param('problemId') problemId: string,
    @Req() req: Request,
  ): Promise<CarePlanDto> {
    requireUuid(id);
    requireUuid(problemId);
    return this.carePlan.deleteProblem(id, problemId, user(req));
  }

  // ── Goal endpoints ────────────────────────────────────────────────────────

  @Post('care-plans/:id/problems/:problemId/goals')
  @HttpCode(HttpStatus.CREATED)
  addGoal(
    @Param('id') id: string,
    @Param('problemId') problemId: string,
    @Body() body: UpsertGoalDto,
    @Req() req: Request,
  ): Promise<CarePlanGoalDto> {
    requireUuid(id);
    requireUuid(problemId);
    return this.carePlan.addGoal(id, problemId, body, user(req));
  }

  @Put('care-plans/:id/goals/:goalId')
  updateGoal(
    @Param('id') id: string,
    @Param('goalId') goalId: string,
    @Body() body: UpsertGoalDto,
    @Req() req: Request,
  ): Promise<CarePlanDto> {
    requireUuid(id);
    requireUuid(goalId);
    return this.carePlan.updateGoal(id, goalId, body, user(req));
  }

  @Patch('care-plans/:id/goals/:goalId/status')
  @HttpCode(HttpStatus.OK)
  updateGoalStatus(
    @Param('id') id: string,
    @Param('goalId') goalId: string,
    @Body('status') status: string,
    @Req() req: Request,
  ): Promise<CarePlanDto> {
    requireUuid(id);
    requireUuid(goalId);
    return this.carePlan.updateGoalStatus(id, goalId, status, user(req));
  }

  @Delete('care-plans/:id/goals/:goalId')
  @HttpCode(HttpStatus.OK)
  deleteGoal(
    @Param('id') id: string,
    @Param('goalId') goalId: string,
    @Req() req: Request,
  ): Promise<CarePlanDto> {
    requireUuid(id);
    requireUuid(goalId);
    return this.carePlan.deleteGoal(id, goalId, user(req));
  }

  // ── Intervention endpoints ────────────────────────────────────────────────

  @Post('care-plans/:id/goals/:goalId/interventions')
  @HttpCode(HttpStatus.CREATED)
  addIntervention(
    @Param('id') id: string,
    @Param('goalId') goalId: string,
    @Body() body: UpsertInterventionDto,
    @Req() req: Request,
  ): Promise<CarePlanDto> {
    requireUuid(id);
    requireUuid(goalId);
    return this.carePlan.addIntervention(id, goalId, body, user(req));
  }

  @Put('care-plans/:id/interventions/:interventionId')
  updateIntervention(
    @Param('id') id: string,
    @Param('interventionId') interventionId: string,
    @Body() body: UpsertInterventionDto,
    @Req() req: Request,
  ): Promise<CarePlanDto> {
    requireUuid(id);
    requireUuid(interventionId);
    return this.carePlan.updateIntervention(id, interventionId, body, user(req));
  }

  @Delete('care-plans/:id/interventions/:interventionId')
  @HttpCode(HttpStatus.OK)
  deleteIntervention(
    @Param('id') id: string,
    @Param('interventionId') interventionId: string,
    @Req() req: Request,
  ): Promise<CarePlanDto> {
    requireUuid(id);
    requireUuid(interventionId);
    return this.carePlan.deleteIntervention(id, interventionId, user(req));
  }

  // ── Progress endpoints ────────────────────────────────────────────────────

  @Post('care-plans/:id/progress')
  @HttpCode(HttpStatus.CREATED)
  recordProgress(
    @Param('id') id: string,
    @Body() body: RecordProgressDto,
    @Req() req: Request,
  ): Promise<CarePlanProgressDto> {
    requireUuid(id);
    return this.carePlan.recordProgress(id, body, user(req), role(req));
  }

  @Get('care-plans/:id/progress')
  getProgress(@Param('id') id: string): Promise<CarePlanProgressDto[]> {
    requireUuid(id);
    return this.carePlan.getProgress(id);
  }

  // ── CDSE integration endpoints ────────────────────────────────────────────

  @Get('care-plans/:id/cdse-suggestions')
  getCdseSuggestions(@Param('id') id: string): Promise<CdseGoalSuggestionDto[]> {
    requireUuid(id);
    return this.carePlan.getCdseSuggestions(id);
  }

  @Post('care-plans/:id/cdse-decisions')
  @HttpCode(HttpStatus.CREATED)
  recordCdseDecisions(
    @Param('id') id: string,
    @Body() body: BulkCdseDecisionsDto,
    @Req() req: Request,
  ): Promise<CdseDecisionResultDto> {
    requireUuid(id);
    return this.carePlan.recordCdseDecisions(id, body, user(req));
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function requireUuid(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new NotFoundException('Resource not found.');
  }
}

function user(req: Request): string {
  return (req as Request & { user?: JwtPayload }).user?.sub ?? 'unknown';
}

function role(req: Request): string {
  return (req as Request & { user?: JwtPayload }).user?.role ?? '';
}
