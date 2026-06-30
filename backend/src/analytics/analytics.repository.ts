import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  AnalyticsFilters,
  KnowledgeAnalyticsDto,
  KnowledgeItemStat,
  NameCount,
  ProgramAnalyticsRow,
  RegistrationAnalyticsDto,
  SchedulerAnalyticsDto,
  WorkerPerformanceRow,
  WorkflowAnalyticsDto,
  WorklistAnalyticsDto,
} from './analytics.types';

/**
 * Data-access layer for analytics. The ONLY place holding analytics SQL. Every
 * figure comes from a parameterised aggregation over existing tables. Filters use
 * the `($n IS NULL OR col = $n)` pattern so a single static query serves any combo
 * (no string building, no SQL injection, no N+1). Each method is defensive: a
 * failing query degrades to null/[] rather than failing the whole dashboard.
 */
@Injectable()
export class AnalyticsRepository {
  private readonly logger = new Logger(AnalyticsRepository.name);

  constructor(private readonly db: DatabaseService) {}

  /** Worklist-context filter params: [from,to,programId,diseaseId,district,assignedTo]. */
  private static wlParams(f: AnalyticsFilters): unknown[] {
    return [f.from, f.to, f.programId, f.diseaseId, f.district, f.assignedTo];
  }

  /** Worklist-context WHERE fragment (w = worklist_items, e = enrollments, c = citizens). */
  private static readonly WL_WHERE = `
    ($1::date IS NULL OR w.created_at::date >= $1::date)
    AND ($2::date IS NULL OR w.created_at::date <= $2::date)
    AND ($3::uuid IS NULL OR COALESCE(w.program_id, e.program_id) = $3::uuid)
    AND ($4::uuid IS NULL OR COALESCE(w.disease_id, e.disease_id) = $4::uuid)
    AND ($5::text IS NULL OR c.district = $5::text)
    AND ($6::text IS NULL OR w.assigned_to = $6::text)`;

  private async safe<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.logger.warn(`Analytics ${label} failed: ${(error as Error).message}`);
      return fallback;
    }
  }

  // ── Executive KPIs ───────────────────────────────────────────────────────

  /** Worklist-derived KPIs (pending/completed/overdue/escalated/avg/rate) in one pass. */
  executiveWorklist(f: AnalyticsFilters) {
    return this.safe(
      'executiveWorklist',
      async () => {
        const r = await this.db.query<{
          pending: number; completed: number; overdue: number; escalated: number;
          total: number; avg_hours: string | null;
        }>(
          `SELECT count(*) FILTER (WHERE w.status='PENDING')::int AS pending,
                  count(*) FILTER (WHERE w.status='COMPLETED')::int AS completed,
                  count(*) FILTER (WHERE w.status='PENDING' AND w.due_date < CURRENT_DATE)::int AS overdue,
                  count(*) FILTER (WHERE w.is_escalation = true)::int AS escalated,
                  count(*)::int AS total,
                  round(avg(EXTRACT(epoch FROM (w.outcome_recorded_at - w.created_at))/3600)
                        FILTER (WHERE w.outcome_recorded_at IS NOT NULL)::numeric, 1)::text AS avg_hours
           FROM public.worklist_items w
           JOIN public.enrollments e ON e.id = w.enrollment_id
           LEFT JOIN public.citizens c ON c.id = e.citizen_id
           WHERE ${AnalyticsRepository.WL_WHERE}`,
          AnalyticsRepository.wlParams(f),
        );
        const row = r.rows[0];
        const completionRate = row && row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0;
        return {
          pending: row?.pending ?? 0,
          completed: row?.completed ?? 0,
          overdue: row?.overdue ?? 0,
          escalated: row?.escalated ?? 0,
          completionRate,
          averageResponseHours: row?.avg_hours != null ? Number(row.avg_hours) : null,
        };
      },
      { pending: 0, completed: 0, overdue: 0, escalated: 0, completionRate: 0, averageResponseHours: null },
    );
  }

  executivePatients(f: AnalyticsFilters) {
    return this.safe(
      'executivePatients',
      async () => {
        const r = await this.db.query<{ total: number; today: number }>(
          `SELECT count(DISTINCT c.id)::int AS total,
                  count(DISTINCT c.id) FILTER (WHERE c.created_at::date = CURRENT_DATE)::int AS today
           FROM public.citizens c
           LEFT JOIN public.enrollments e ON e.citizen_id = c.id
           WHERE ($1::date IS NULL OR c.created_at::date >= $1::date)
             AND ($2::date IS NULL OR c.created_at::date <= $2::date)
             AND ($5::text IS NULL OR c.district = $5::text)
             AND ($3::uuid IS NULL OR e.program_id = $3::uuid)
             AND ($4::uuid IS NULL OR e.disease_id = $4::uuid)
             AND ($6::text IS NULL OR e.assigned_worker = $6::text)`,
          AnalyticsRepository.wlParams(f),
        );
        return { total: r.rows[0]?.total ?? 0, today: r.rows[0]?.today ?? 0 };
      },
      { total: 0, today: 0 },
    );
  }

  activeEnrollments(f: AnalyticsFilters): Promise<number> {
    return this.safe(
      'activeEnrollments',
      async () => {
        const r = await this.db.query<{ c: number }>(
          `SELECT count(*)::int AS c FROM public.enrollments e
           LEFT JOIN public.citizens c ON c.id = e.citizen_id
           WHERE e.status='ACTIVE'
             AND ($1::date IS NULL OR e.created_at::date >= $1::date)
             AND ($2::date IS NULL OR e.created_at::date <= $2::date)
             AND ($3::uuid IS NULL OR e.program_id = $3::uuid)
             AND ($4::uuid IS NULL OR e.disease_id = $4::uuid)
             AND ($5::text IS NULL OR c.district = $5::text)
             AND ($6::text IS NULL OR e.assigned_worker = $6::text)`,
          AnalyticsRepository.wlParams(f),
        );
        return r.rows[0]?.c ?? 0;
      },
      0,
    );
  }

  duplicateRequests(f: AnalyticsFilters): Promise<number> {
    return this.safe(
      'duplicateRequests',
      async () => {
        const r = await this.db.query<{ c: number }>(
          `SELECT count(*)::int AS c FROM public.duplicate_requests
           WHERE ($1::date IS NULL OR submitted_at::date >= $1::date)
             AND ($2::date IS NULL OR submitted_at::date <= $2::date)`,
          [f.from, f.to],
        );
        return r.rows[0]?.c ?? 0;
      },
      0,
    );
  }

  schedulerRunsToday(): Promise<number> {
    return this.safe(
      'schedulerRunsToday',
      async () => {
        const r = await this.db.query<{ c: number }>(
          `SELECT count(*)::int AS c FROM public.scheduler_runs WHERE started_at::date = CURRENT_DATE`,
        );
        return r.rows[0]?.c ?? 0;
      },
      0,
    );
  }

  /** Workflow success = % of recorded outcomes in the POSITIVE category. */
  workflowSuccessRate(f: AnalyticsFilters): Promise<number | null> {
    return this.safe(
      'workflowSuccessRate',
      async () => {
        const r = await this.db.query<{ total: number; positive: number }>(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE ot.category='POSITIVE')::int AS positive
           FROM public.outcome_records orr
           JOIN public.outcome_types ot ON ot.id = orr.outcome_type_id
           WHERE ($1::date IS NULL OR orr.recorded_at::date >= $1::date)
             AND ($2::date IS NULL OR orr.recorded_at::date <= $2::date)`,
          [f.from, f.to],
        );
        const row = r.rows[0];
        return row && row.total > 0 ? Math.round((row.positive / row.total) * 100) : null;
      },
      null,
    );
  }

  // ── Program analytics ──────────────────────────────────────────────────────

  programs(f: AnalyticsFilters): Promise<ProgramAnalyticsRow[]> {
    return this.safe(
      'programs',
      async () => {
        const r = await this.db.query<{
          program_id: string; program: string; patients: number; active: number;
          completed: number; pending: number; overdue: number; total_acts: number;
        }>(
          `SELECT p.id AS program_id, p.name AS program,
                  count(DISTINCT e.citizen_id)::int AS patients,
                  count(DISTINCT e.id) FILTER (WHERE e.status='ACTIVE')::int AS active,
                  count(w.id) FILTER (WHERE w.status='COMPLETED')::int AS completed,
                  count(w.id) FILTER (WHERE w.status='PENDING')::int AS pending,
                  count(w.id) FILTER (WHERE w.status='PENDING' AND w.due_date < CURRENT_DATE)::int AS overdue,
                  count(w.id)::int AS total_acts
           FROM public.programs p
           LEFT JOIN public.enrollments e ON e.program_id = p.id
             AND ($6::text IS NULL OR e.assigned_worker = $6::text)
             AND ($4::uuid IS NULL OR e.disease_id = $4::uuid)
           LEFT JOIN public.citizens c ON c.id = e.citizen_id
             AND ($5::text IS NULL OR c.district = $5::text)
           LEFT JOIN public.worklist_items w ON w.enrollment_id = e.id
             AND ($1::date IS NULL OR w.created_at::date >= $1::date)
             AND ($2::date IS NULL OR w.created_at::date <= $2::date)
           WHERE p.is_active = true AND ($3::uuid IS NULL OR p.id = $3::uuid)
           GROUP BY p.id, p.name
           ORDER BY patients DESC, p.name`,
          AnalyticsRepository.wlParams(f),
        );
        return r.rows.map((row) => ({
          programId: row.program_id,
          program: row.program,
          registeredPatients: row.patients,
          activeEnrollments: row.active,
          completedActivities: row.completed,
          pendingActivities: row.pending,
          overdueActivities: row.overdue,
          completionRate: row.total_acts > 0 ? Math.round((row.completed / row.total_acts) * 100) : 0,
        }));
      },
      [],
    );
  }

  // ── Worklist analytics ─────────────────────────────────────────────────────

  worklist(f: AnalyticsFilters): Promise<WorklistAnalyticsDto> {
    return this.safe(
      'worklist',
      async () => {
        const r = await this.db.query<{
          pending: number; completed: number; overdue: number; escalated: number;
          retries: number; avg_hours: string | null; created_today: number;
          completed_today: number; created_week: number;
        }>(
          `SELECT count(*) FILTER (WHERE w.status='PENDING')::int AS pending,
                  count(*) FILTER (WHERE w.status='COMPLETED')::int AS completed,
                  count(*) FILTER (WHERE w.status='PENDING' AND w.due_date < CURRENT_DATE)::int AS overdue,
                  count(*) FILTER (WHERE w.is_escalation=true)::int AS escalated,
                  COALESCE(sum(w.retry_count),0)::int AS retries,
                  round(avg(EXTRACT(epoch FROM (w.outcome_recorded_at - w.created_at))/3600)
                        FILTER (WHERE w.outcome_recorded_at IS NOT NULL)::numeric,1)::text AS avg_hours,
                  count(*) FILTER (WHERE w.created_at::date = CURRENT_DATE)::int AS created_today,
                  count(*) FILTER (WHERE w.outcome_recorded_at::date = CURRENT_DATE)::int AS completed_today,
                  count(*) FILTER (WHERE w.created_at >= date_trunc('week', CURRENT_DATE))::int AS created_week
           FROM public.worklist_items w
           JOIN public.enrollments e ON e.id = w.enrollment_id
           LEFT JOIN public.citizens c ON c.id = e.citizen_id
           WHERE ${AnalyticsRepository.WL_WHERE}`,
          AnalyticsRepository.wlParams(f),
        );
        const row = r.rows[0];
        return {
          pending: row?.pending ?? 0,
          completed: row?.completed ?? 0,
          overdue: row?.overdue ?? 0,
          escalated: row?.escalated ?? 0,
          totalRetries: row?.retries ?? 0,
          averageCompletionHours: row?.avg_hours != null ? Number(row.avg_hours) : null,
          createdToday: row?.created_today ?? 0,
          completedToday: row?.completed_today ?? 0,
          createdThisWeek: row?.created_week ?? 0,
        };
      },
      {
        pending: 0, completed: 0, overdue: 0, escalated: 0, totalRetries: 0,
        averageCompletionHours: null, createdToday: 0, completedToday: 0, createdThisWeek: 0,
      },
    );
  }

  // ── Worker performance ───────────────────────────────────────────────────

  workers(f: AnalyticsFilters): Promise<WorkerPerformanceRow[]> {
    return this.safe(
      'workers',
      async () => {
        const r = await this.db.query<{
          username: string; full_name: string; role: string; assigned: number;
          completed: number; pending: number; overdue: number; escalations: number;
          retries: number; avg_hours: string | null;
        }>(
          `SELECT u.username, u.full_name, u.role,
                  count(w.id)::int AS assigned,
                  count(w.id) FILTER (WHERE w.status='COMPLETED')::int AS completed,
                  count(w.id) FILTER (WHERE w.status='PENDING')::int AS pending,
                  count(w.id) FILTER (WHERE w.status='PENDING' AND w.due_date < CURRENT_DATE)::int AS overdue,
                  count(w.id) FILTER (WHERE w.is_escalation=true)::int AS escalations,
                  COALESCE(sum(w.retry_count),0)::int AS retries,
                  round(avg(EXTRACT(epoch FROM (w.outcome_recorded_at - w.created_at))/3600)
                        FILTER (WHERE w.outcome_recorded_at IS NOT NULL)::numeric,1)::text AS avg_hours
           FROM public.users u
           LEFT JOIN public.worklist_items w ON w.assigned_to = u.username
             AND ($1::date IS NULL OR w.created_at::date >= $1::date)
             AND ($2::date IS NULL OR w.created_at::date <= $2::date)
             AND ($3::uuid IS NULL OR w.program_id = $3::uuid)
           WHERE u.is_active = true AND ($4::text IS NULL OR u.username = $4::text)
           GROUP BY u.username, u.full_name, u.role
           ORDER BY assigned DESC, u.full_name`,
          [f.from, f.to, f.programId, f.assignedTo],
        );
        return r.rows.map((row) => ({
          username: row.username,
          fullName: row.full_name,
          role: row.role,
          assigned: row.assigned,
          completed: row.completed,
          pending: row.pending,
          overdue: row.overdue,
          completionRate: row.assigned > 0 ? Math.round((row.completed / row.assigned) * 100) : 0,
          averageResponseHours: row.avg_hours != null ? Number(row.avg_hours) : null,
          escalations: row.escalations,
          retries: row.retries,
        }));
      },
      [],
    );
  }

  // ── Registration analytics ───────────────────────────────────────────────

  registrations(f: AnalyticsFilters): Promise<RegistrationAnalyticsDto> {
    return this.safe(
      'registrations',
      async () => {
        const totals = await this.db.query<{ today: number; week: number; month: number }>(
          `SELECT count(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS today,
                  count(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE))::int AS week,
                  count(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::int AS month
           FROM public.citizens c
           WHERE ($1::text IS NULL OR c.district = $1::text)`,
          [f.district],
        );
        const byProgram = await this.db.query<{ name: string; count: number }>(
          `SELECT p.name, count(*)::int AS count
           FROM public.enrollments e JOIN public.programs p ON p.id = e.program_id
           WHERE ($1::date IS NULL OR e.created_at::date >= $1::date)
             AND ($2::date IS NULL OR e.created_at::date <= $2::date)
             AND ($3::text IS NULL OR e.assigned_worker = $3::text)
           GROUP BY p.name ORDER BY count DESC LIMIT 12`,
          [f.from, f.to, f.assignedTo],
        );
        const byWorker = await this.db.query<{ name: string; count: number }>(
          `SELECT COALESCE(u.full_name, e.assigned_worker, 'Unassigned') AS name, count(*)::int AS count
           FROM public.enrollments e
           LEFT JOIN public.users u ON u.username = e.assigned_worker
           WHERE ($1::date IS NULL OR e.created_at::date >= $1::date)
             AND ($2::date IS NULL OR e.created_at::date <= $2::date)
           GROUP BY 1 ORDER BY count DESC LIMIT 12`,
          [f.from, f.to],
        );
        const dup = await this.db.query<{ c: number }>(
          `SELECT count(*)::int AS c FROM public.duplicate_requests`,
        );
        const t = totals.rows[0];
        return {
          today: t?.today ?? 0,
          thisWeek: t?.week ?? 0,
          thisMonth: t?.month ?? 0,
          byProgram: byProgram.rows as NameCount[],
          byWorker: byWorker.rows as NameCount[],
          duplicatesPrevented: dup.rows[0]?.c ?? 0,
          bulkUploads: null, // source (bulk vs single) not tracked on citizens yet
        };
      },
      {
        today: 0, thisWeek: 0, thisMonth: 0, byProgram: [], byWorker: [],
        duplicatesPrevented: 0, bulkUploads: null,
      },
    );
  }

  // ── Scheduler analytics ────────────────────────────────────────────────────

  scheduler(): Promise<SchedulerAnalyticsDto> {
    return this.safe(
      'scheduler',
      async () => {
        const r = await this.db.query<{
          runs: number; acts: number; retries: number; escalations: number;
          failures: number; avg_ms: string | null; runs_today: number;
        }>(
          `SELECT count(*)::int AS runs,
                  COALESCE(sum(activities_created),0)::int AS acts,
                  COALESCE(sum(retries),0)::int AS retries,
                  COALESCE(sum(escalations),0)::int AS escalations,
                  COALESCE(sum(failures),0)::int AS failures,
                  round(avg(EXTRACT(epoch FROM (finished_at - started_at))*1000)
                        FILTER (WHERE finished_at IS NOT NULL)::numeric,0)::text AS avg_ms,
                  count(*) FILTER (WHERE started_at::date = CURRENT_DATE)::int AS runs_today
           FROM public.scheduler_runs`,
        );
        const row = r.rows[0];
        const runs = row?.runs ?? 0;
        const failures = row?.failures ?? 0;
        return {
          totalRuns: runs,
          activitiesGenerated: row?.acts ?? 0,
          retries: row?.retries ?? 0,
          escalations: row?.escalations ?? 0,
          failures,
          averageRuntimeMs: row?.avg_ms != null ? Number(row.avg_ms) : null,
          successRate: runs > 0 ? Math.round(((runs - failures) / runs) * 100) : null,
          runsToday: row?.runs_today ?? 0,
        };
      },
      {
        totalRuns: 0, activitiesGenerated: 0, retries: 0, escalations: 0, failures: 0,
        averageRuntimeMs: null, successRate: null, runsToday: 0,
      },
    );
  }

  // ── Workflow analytics ─────────────────────────────────────────────────────

  workflow(f: AnalyticsFilters): Promise<WorkflowAnalyticsDto> {
    return this.safe(
      'workflow',
      async () => {
        const outcomes = await this.db.query<{ name: string; category: string; count: number }>(
          `SELECT ot.name, ot.category, count(*)::int AS count
           FROM public.outcome_records orr
           JOIN public.outcome_types ot ON ot.id = orr.outcome_type_id
           WHERE ($1::date IS NULL OR orr.recorded_at::date >= $1::date)
             AND ($2::date IS NULL OR orr.recorded_at::date <= $2::date)
           GROUP BY ot.name, ot.category ORDER BY count DESC LIMIT 10`,
          [f.from, f.to],
        );
        const cat = await this.db.query<{ category: string; count: number }>(
          `SELECT ot.category, count(*)::int AS count
           FROM public.outcome_records orr JOIN public.outcome_types ot ON ot.id = orr.outcome_type_id
           GROUP BY ot.category`,
        );
        const delay = await this.db.query<{ avg_delay: string | null }>(
          `SELECT round(avg(delay_days)::numeric,1)::text AS avg_delay FROM public.rules WHERE is_active=true`,
        );
        const today = await this.db.query<{ c: number }>(
          `SELECT count(*)::int AS c FROM public.outcome_records WHERE recorded_at::date = CURRENT_DATE`,
        );
        const total = cat.rows.reduce((s, r) => s + r.count, 0);
        const find = (c: string) => cat.rows.find((r) => r.category === c)?.count ?? 0;
        const escalation = find('ESCALATION');
        const negative = find('NEGATIVE');
        const positive = find('POSITIVE');
        return {
          mostTriggeredOutcomes: outcomes.rows.map((r) => ({ name: r.name, count: r.count })),
          mostCommonOutcomes: cat.rows.map((r) => ({ name: r.category, count: r.count })),
          // Retry success ≈ positive outcomes among retry-eligible (neutral+negative+positive).
          retrySuccessRate: positive + negative > 0 ? Math.round((positive / (positive + negative)) * 100) : null,
          escalationRate: total > 0 ? Math.round((escalation / total) * 100) : null,
          averageDelayDays: delay.rows[0]?.avg_delay != null ? Number(delay.rows[0].avg_delay) : null,
          rulesExecutedToday: today.rows[0]?.c ?? 0,
        };
      },
      {
        mostTriggeredOutcomes: [], mostCommonOutcomes: [], retrySuccessRate: null,
        escalationRate: null, averageDelayDays: null, rulesExecutedToday: 0,
      },
    );
  }

  // ── Knowledge analytics (catalogue counts; views = future) ─────────────────

  knowledge(): Promise<KnowledgeAnalyticsDto> {
    return this.safe(
      'knowledge',
      async () => {
        const totals = await this.db.query<{ guidebooks: number; faqs: number; training: number; emergency: number }>(
          `SELECT (SELECT count(*) FROM public.guidebooks WHERE is_active)::int AS guidebooks,
                  (SELECT count(*) FROM public.faqs WHERE is_active)::int AS faqs,
                  (SELECT count(*) FROM public.training_modules WHERE is_active)::int AS training,
                  (SELECT count(*) FROM public.guidebooks WHERE is_active AND category='EMERGENCY')::int AS emergency`,
        );
        const top = async (sql: string): Promise<KnowledgeItemStat[]> => {
          const r = await this.db.query<{ id: string; title: string; category: string | null }>(sql);
          return r.rows.map((row) => ({ id: row.id, title: row.title, category: row.category, views: null }));
        };
        const [g, fa, tr, em] = await Promise.all([
          top(`SELECT id, title, category FROM public.guidebooks WHERE is_active ORDER BY updated_at DESC LIMIT 5`),
          top(`SELECT id, question AS title, category FROM public.faqs WHERE is_active ORDER BY updated_at DESC LIMIT 5`),
          top(`SELECT id, title, category FROM public.training_modules WHERE is_active ORDER BY updated_at DESC LIMIT 5`),
          top(`SELECT id, title, category FROM public.guidebooks WHERE is_active AND category='EMERGENCY' ORDER BY updated_at DESC LIMIT 5`),
        ]);
        const t = totals.rows[0];
        return {
          totals: { guidebooks: t?.guidebooks ?? 0, faqs: t?.faqs ?? 0, training: t?.training ?? 0, emergency: t?.emergency ?? 0 },
          topGuidebooks: g, topFaqs: fa, topTraining: tr, topEmergency: em,
          tracking: false,
        };
      },
      {
        totals: { guidebooks: 0, faqs: 0, training: 0, emergency: 0 },
        topGuidebooks: [], topFaqs: [], topTraining: [], topEmergency: [], tracking: false,
      },
    );
  }

  /** Options for the reusable filter bar (programs, workers, districts, diseases). */
  filterOptions(): Promise<{
    programs: { id: string; name: string }[];
    workers: { username: string; fullName: string; role: string }[];
    districts: string[];
    diseases: { id: string; name: string }[];
  }> {
    return this.safe(
      'filterOptions',
      async () => {
        const [programs, workers, districts, diseases] = await Promise.all([
          this.db.query<{ id: string; name: string }>(
            `SELECT id, name FROM public.programs WHERE is_active = true ORDER BY name`,
          ),
          this.db.query<{ username: string; full_name: string; role: string }>(
            `SELECT username, full_name, role FROM public.users WHERE is_active = true ORDER BY full_name`,
          ),
          this.districts(),
          this.db.query<{ id: string; name: string }>(
            `SELECT id, name FROM public.diseases WHERE is_active = true ORDER BY name`,
          ),
        ]);
        return {
          programs: programs.rows,
          workers: workers.rows.map((w) => ({ username: w.username, fullName: w.full_name, role: w.role })),
          districts,
          diseases: diseases.rows,
        };
      },
      { programs: [], workers: [], districts: [], diseases: [] },
    );
  }

  /** Distinct districts for the filter bar. */
  districts(): Promise<string[]> {
    return this.safe(
      'districts',
      async () => {
        const r = await this.db.query<{ district: string }>(
          `SELECT DISTINCT district FROM public.citizens WHERE district IS NOT NULL ORDER BY district`,
        );
        return r.rows.map((row) => row.district);
      },
      [],
    );
  }
}
