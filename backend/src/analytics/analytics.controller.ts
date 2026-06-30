import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { AnalyticsService, AnalyticsQuery } from './analytics.service';
import {
  ExecutiveSummaryDto,
  KnowledgeAnalyticsDto,
  OperationsDashboardDto,
  ProgramAnalyticsRow,
  RegistrationAnalyticsDto,
  SchedulerAnalyticsDto,
  WorkerPerformanceRow,
  WorkflowAnalyticsDto,
  WorklistAnalyticsDto,
} from './analytics.types';

/**
 * Analytics API. Protected by the existing JWT guard. Read-only. Every endpoint
 * accepts the same optional filters (from, to, programId, diseaseId, district,
 * worker) and is role-scoped server-side, so workers only ever see their own
 * data while administrators see everything.
 */
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Single-round-trip endpoint for the Operations Dashboard. */
  @Get('operations')
  operations(@Query() q: AnalyticsQuery, @Req() req: Request): Promise<OperationsDashboardDto> {
    return this.analytics.operations(this.filters(q, req));
  }

  @Get('executive')
  executive(@Query() q: AnalyticsQuery, @Req() req: Request): Promise<ExecutiveSummaryDto> {
    return this.analytics.executive(this.filters(q, req));
  }

  @Get('programs')
  programs(@Query() q: AnalyticsQuery, @Req() req: Request): Promise<ProgramAnalyticsRow[]> {
    return this.analytics.programs(this.filters(q, req));
  }

  @Get('worklist')
  worklist(@Query() q: AnalyticsQuery, @Req() req: Request): Promise<WorklistAnalyticsDto> {
    return this.analytics.worklist(this.filters(q, req));
  }

  @Get('workers')
  workers(@Query() q: AnalyticsQuery, @Req() req: Request): Promise<WorkerPerformanceRow[]> {
    return this.analytics.workers(this.filters(q, req));
  }

  @Get('registrations')
  registrations(@Query() q: AnalyticsQuery, @Req() req: Request): Promise<RegistrationAnalyticsDto> {
    return this.analytics.registrations(this.filters(q, req));
  }

  @Get('scheduler')
  scheduler(): Promise<SchedulerAnalyticsDto> {
    return this.analytics.scheduler();
  }

  @Get('workflow')
  workflow(@Query() q: AnalyticsQuery, @Req() req: Request): Promise<WorkflowAnalyticsDto> {
    return this.analytics.workflow(this.filters(q, req));
  }

  @Get('knowledge')
  knowledge(): Promise<KnowledgeAnalyticsDto> {
    return this.analytics.knowledge();
  }

  @Get('filter-options')
  filterOptions() {
    return this.analytics.filterOptions();
  }

  private filters(q: AnalyticsQuery, req: Request) {
    const user = (req as Request & { user?: JwtPayload }).user;
    return this.analytics.buildFilters(q, user);
  }
}
