import { Injectable } from '@nestjs/common';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { AnalyticsRepository } from './analytics.repository';
import {
  AnalyticsFilters,
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

/** Raw query string filters (all optional). */
export interface AnalyticsQuery {
  from?: string;
  to?: string;
  programId?: string;
  diseaseId?: string;
  district?: string;
  worker?: string;
}

/**
 * Business layer for analytics. Normalises filters, enforces role-based scoping,
 * and assembles the executive summary. Holds no SQL — all aggregation lives in the
 * repository, so there is no duplicate reporting logic.
 *
 * Scoping: System administrators see everything and may filter by any worker.
 * Non-admin roles (clinicians, care assistants / ASHAs, ANMs) are scoped to their
 * own assigned data — `assignedTo` is forced to their username regardless of the
 * requested worker filter, reusing the existing JWT identity.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly repo: AnalyticsRepository) {}

  /** Builds the effective, role-scoped filter set from the query + the user. */
  buildFilters(query: AnalyticsQuery, user: JwtPayload | undefined): AnalyticsFilters {
    const isAdmin = (user?.role ?? '').toUpperCase() === 'ADMIN';
    const clean = (v?: string): string | null => (v && v.trim() ? v.trim() : null);
    return {
      from: clean(query.from),
      to: clean(query.to),
      programId: clean(query.programId),
      diseaseId: clean(query.diseaseId),
      district: clean(query.district),
      // Non-admins are locked to their own assigned data.
      assignedTo: isAdmin ? clean(query.worker) : user?.sub ?? '__none__',
    };
  }

  async executive(f: AnalyticsFilters): Promise<ExecutiveSummaryDto> {
    const [wl, patients, active, duplicates, schedRuns, successRate] = await Promise.all([
      this.repo.executiveWorklist(f),
      this.repo.executivePatients(f),
      this.repo.activeEnrollments(f),
      this.repo.duplicateRequests(f),
      this.repo.schedulerRunsToday(),
      this.repo.workflowSuccessRate(f),
    ]);
    return {
      totalPatients: patients.total,
      todaysRegistrations: patients.today,
      activeEnrollments: active,
      pendingActivities: wl.pending,
      completedActivities: wl.completed,
      overdueActivities: wl.overdue,
      escalatedCases: wl.escalated,
      duplicateRequests: duplicates,
      schedulerRunsToday: schedRuns,
      workflowSuccessRate: successRate,
      completionRate: wl.completionRate,
      averageResponseHours: wl.averageResponseHours,
    };
  }

  operations(f: AnalyticsFilters): Promise<OperationsDashboardDto> {
    return this.repo.operations(f);
  }

  programs(f: AnalyticsFilters): Promise<ProgramAnalyticsRow[]> {
    return this.repo.programs(f);
  }
  worklist(f: AnalyticsFilters): Promise<WorklistAnalyticsDto> {
    return this.repo.worklist(f);
  }
  workers(f: AnalyticsFilters): Promise<WorkerPerformanceRow[]> {
    return this.repo.workers(f);
  }
  registrations(f: AnalyticsFilters): Promise<RegistrationAnalyticsDto> {
    return this.repo.registrations(f);
  }
  scheduler(): Promise<SchedulerAnalyticsDto> {
    return this.repo.scheduler();
  }
  workflow(f: AnalyticsFilters): Promise<WorkflowAnalyticsDto> {
    return this.repo.workflow(f);
  }
  knowledge(): Promise<KnowledgeAnalyticsDto> {
    return this.repo.knowledge();
  }
  filterOptions() {
    return this.repo.filterOptions();
  }
}
