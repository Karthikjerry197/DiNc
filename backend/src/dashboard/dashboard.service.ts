import { Injectable, Logger } from '@nestjs/common';
import { hasPermission } from '../auth/permissions';
import { DatabaseService } from '../database/database.service';
import {
  ActivityItem,
  AdminDashboardSummary,
  ProgramSummaryItem,
  RiskBreakdown,
  ServiceItem,
  WorklistRow,
} from './dashboard.types';

/**
 * Read-only aggregation for the Administrator Dashboard.
 *
 * Only SELECT statements are issued — never INSERT/UPDATE/DELETE and never any
 * DDL. Each widget is resolved independently and defensively: a failing query
 * (e.g. a permission issue on a single table) yields `null`/`[]` for that widget
 * so the dashboard still renders with an empty state rather than failing wholesale.
 * Only summary-sized data is fetched (counts + small LIMITed lists); no large
 * datasets are preloaded.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  /**
   * Data-integrity guard: a worklist item only counts/displays when it still
   * references an existing enrollment. This excludes orphaned items (e.g. left
   * over from a deleted enrollment) so they never appear with missing context.
   */
  private static readonly LINKED_ENROLLMENT =
    'EXISTS (SELECT 1 FROM public.enrollments en WHERE en.id = w.enrollment_id)';

  /**
   * Viewer scope fragment (M31): `$1` is the viewer's username, or NULL for
   * viewers holding `dashboard.view.all` (scope disabled).
   */
  private static readonly ASSIGNEE_SCOPE =
    '($1::varchar IS NULL OR w.assigned_to = $1)';

  constructor(private readonly db: DatabaseService) {}

  /**
   * Dashboard summary, scoped by permission (M31): viewers holding
   * `dashboard.view.all` see every activity; everyone else sees only the
   * worklist items assigned to them (and their own recorded outcomes).
   * Population-level stats (citizens, enrollments, programmes, knowledge,
   * services, notifications) are not per-user activities and stay global.
   */
  async getAdminSummary(viewer: {
    username: string;
    role: string;
  }): Promise<AdminDashboardSummary> {
    const scopeTo = hasPermission(viewer.role, 'dashboard.view.all')
      ? null
      : viewer.username;
    // `($1 IS NULL OR column = $1)` — NULL disables the scope (view-all).
    const scope = [scopeTo];
    const [
      registeredCitizens,
      activeEnrollments,
      totalEnrollments,
      programs,
      subPrograms,
      knowledgeAssets,
      cphcServices,
      pendingNotifications,
      pendingTasks,
      overdueTasks,
      completedTasks,
      completedToday,
      referredTasks,
      noAnswerToday,
      emergencyReferrals,
      services,
      programsSummary,
      recentActivity,
      recentWorklist,
    ] = await Promise.all([
      this.count('SELECT count(*)::int AS c FROM public.citizens'),
      this.count(
        "SELECT count(*)::int AS c FROM public.enrollments WHERE status = 'ACTIVE'",
      ),
      this.count('SELECT count(*)::int AS c FROM public.enrollments'),
      this.count(
        'SELECT count(*)::int AS c FROM public.programs WHERE is_active = true',
      ),
      this.count(
        'SELECT count(*)::int AS c FROM public.sub_programs WHERE is_active = true',
      ),
      this.count(
        'SELECT count(*)::int AS c FROM public.knowledge_assets WHERE is_active = true',
      ),
      this.count(
        'SELECT count(*)::int AS c FROM public.cphc_services WHERE is_active = true',
      ),
      this.count(
        "SELECT count(*)::int AS c FROM public.notifications WHERE status = 'PENDING'",
      ),
      this.count(
        `SELECT count(*)::int AS c FROM public.worklist_items w
         WHERE w.status = 'PENDING' AND ${DashboardService.LINKED_ENROLLMENT}
           AND ${DashboardService.ASSIGNEE_SCOPE}`,
        scope,
      ),
      this.count(
        `SELECT count(*)::int AS c FROM public.worklist_items w
         WHERE w.status = 'PENDING' AND w.due_date < CURRENT_DATE AND ${DashboardService.LINKED_ENROLLMENT}
           AND ${DashboardService.ASSIGNEE_SCOPE}`,
        scope,
      ),
      this.count(
        `SELECT count(*)::int AS c FROM public.worklist_items w
         WHERE w.status = 'COMPLETED' AND ${DashboardService.LINKED_ENROLLMENT}
           AND ${DashboardService.ASSIGNEE_SCOPE}`,
        scope,
      ),
      this.count(
        `SELECT count(*)::int AS c FROM public.worklist_items w
         WHERE w.status = 'COMPLETED' AND w.outcome_recorded_at::date = CURRENT_DATE
           AND ${DashboardService.LINKED_ENROLLMENT}
           AND ${DashboardService.ASSIGNEE_SCOPE}`,
        scope,
      ),
      this.count(
        `SELECT count(*)::int AS c FROM public.worklist_items w
         WHERE w.status = 'REFERRED' AND ${DashboardService.LINKED_ENROLLMENT}
           AND ${DashboardService.ASSIGNEE_SCOPE}`,
        scope,
      ),
      this.count(
        `SELECT count(*)::int AS c FROM public.outcome_records orr
         WHERE orr.data ->> 'outcomeCategory' = 'NEGATIVE'
           AND orr.recorded_at::date = CURRENT_DATE
           AND ($1::varchar IS NULL OR orr.recorded_by = $1)`,
        scope,
      ),
      this.count(
        `SELECT count(*)::int AS c FROM public.worklist_items w
         WHERE w.status = 'EMERGENCY' AND ${DashboardService.LINKED_ENROLLMENT}
           AND ${DashboardService.ASSIGNEE_SCOPE}`,
        scope,
      ),
      this.services(),
      this.programs(),
      this.recentActivity(),
      this.recentWorklist(scopeTo),
    ]);

    const risk = await this.riskBreakdown();

    return {
      stats: {
        registeredCitizens,
        activeEnrollments,
        totalEnrollments,
        programs,
        subPrograms,
        knowledgeAssets,
        cphcServices,
        pendingNotifications,
        pendingTasks,
        overdueTasks,
      },
      risk,
      worklist: {
        pending: pendingTasks,
        overdue: overdueTasks,
        completed: completedTasks,
        completedToday,
        referred: referredTasks,
        noAnswer: noAnswerToday,
        emergencyReferrals,
      },
      services,
      programs: programsSummary,
      recentActivity,
      recentWorklist,
    };
  }

  /**
   * Active programs with their active-enrollment counts for the Programs Summary
   * widget. A LEFT JOIN keeps programs with no enrollments visible (count 0).
   */
  private async programs(): Promise<ProgramSummaryItem[]> {
    try {
      const result = await this.db.query<{ name: string; active_enrollments: number }>(
        `SELECT p.name AS name,
                count(e.id) FILTER (WHERE e.status = 'ACTIVE')::int AS active_enrollments
         FROM public.programs p
         LEFT JOIN public.enrollments e ON e.program_id = p.id
         WHERE p.is_active = true
         GROUP BY p.id, p.name
         ORDER BY active_enrollments DESC, p.name
         LIMIT 12`,
      );
      return result.rows.map((row) => ({
        name: row.name,
        activeEnrollments: row.active_enrollments,
      }));
    } catch (error) {
      this.logger.warn(`Dashboard programs query failed: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Population-level clinical risk counts (M32), one citizen counted once at
   * their severest level. NO new risk logic: severe/moderate read the ACTIVE
   * clinical_alerts the CDSE already writes, and low mirrors
   * CdseService.getLatestRisk's fallback (has a consultation, no active alert).
   */
  private async riskBreakdown(): Promise<RiskBreakdown> {
    const [severe, moderate, low] = await Promise.all([
      this.count(
        `SELECT count(DISTINCT citizen_id)::int AS c
         FROM public.clinical_alerts
         WHERE status = 'ACTIVE' AND risk_level = 'SEVERE'`,
      ),
      this.count(
        `SELECT count(DISTINCT ca.citizen_id)::int AS c
         FROM public.clinical_alerts ca
         WHERE ca.status = 'ACTIVE' AND ca.risk_level = 'MODERATE'
           AND NOT EXISTS (
             SELECT 1 FROM public.clinical_alerts s
             WHERE s.citizen_id = ca.citizen_id
               AND s.status = 'ACTIVE' AND s.risk_level = 'SEVERE'
           )`,
      ),
      this.count(
        `SELECT count(DISTINCT e.citizen_id)::int AS c
         FROM public.outcome_records orec
         JOIN public.worklist_items w ON w.id = orec.worklist_item_id
         JOIN public.enrollments e ON e.id = w.enrollment_id
         WHERE NOT EXISTS (
           SELECT 1 FROM public.clinical_alerts ca
           WHERE ca.citizen_id = e.citizen_id AND ca.status = 'ACTIVE'
         )`,
      ),
    ]);
    return { low, moderate, severe };
  }

  /** Runs a single-row `count(*) AS c` query, returning the count or `null` on failure. */
  private async count(sql: string, params: unknown[] = []): Promise<number | null> {
    try {
      const result = await this.db.query<{ c: number }>(sql, params);
      return result.rows[0]?.c ?? 0;
    } catch (error) {
      this.logger.warn(`Dashboard count query failed: ${(error as Error).message}`);
      return null;
    }
  }

  /** Active CPHC services (small reference list) for the services widget. */
  private async services(): Promise<ServiceItem[]> {
    try {
      const result = await this.db.query<ServiceItem>(
        `SELECT name, icon, color
         FROM public.cphc_services
         WHERE is_active = true
         ORDER BY name
         LIMIT 12`,
      );
      return result.rows;
    } catch (error) {
      this.logger.warn(`Dashboard services query failed: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Most recent system activity, drawn from real timestamps across the core
   * operational tables (citizen registrations, enrollments, worklist tasks,
   * notifications). Limited to the latest few entries.
   */
  private async recentActivity(): Promise<ActivityItem[]> {
    try {
      const result = await this.db.query<{
        kind: string;
        title: string;
        subtitle: string;
        at: Date;
      }>(
        `SELECT kind, title, subtitle, at FROM (
           -- UHID is the Dashboard's only patient identity (never names).
           SELECT 'CITIZEN'::text AS kind,
                  c.uhid AS title,
                  'Citizen registered'::text AS subtitle,
                  created_at AS at
             FROM public.citizens c
           UNION ALL
           SELECT 'ENROLLMENT'::text,
                  c.uhid,
                  'Enrolled in ' || p.name,
                  e.created_at
             FROM public.enrollments e
             JOIN public.citizens c ON c.id = e.citizen_id
             JOIN public.programs p ON p.id = e.program_id
           UNION ALL
           SELECT 'WORKLIST'::text,
                  'Worklist task ' || w.status,
                  w.priority || ' priority',
                  w.created_at
             FROM public.worklist_items w
             WHERE ${DashboardService.LINKED_ENROLLMENT}
           UNION ALL
           SELECT 'NOTIFICATION'::text,
                  'Notification ' || n.status,
                  n.channel,
                  n.created_at
             FROM public.notifications n
         ) feed
         ORDER BY at DESC
         LIMIT 8`,
      );
      return result.rows.map((row) => ({
        kind: row.kind,
        title: row.title,
        subtitle: row.subtitle,
        at: row.at.toISOString(),
      }));
    } catch (error) {
      this.logger.warn(`Dashboard activity query failed: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * A handful of upcoming worklist items, joined to citizen + activity for
   * context. `assignedTo` scopes the list to one user's items (null = all).
   */
  private async recentWorklist(assignedTo: string | null): Promise<WorklistRow[]> {
    try {
      const result = await this.db.query<{
        uhid: string | null;
        citizen: string | null;
        activity: string | null;
        due_date: Date | null;
        priority: string;
        status: string;
      }>(
        `SELECT c.uhid AS uhid,
                c.full_name AS citizen,
                ev.name AS activity,
                w.due_date AS due_date,
                w.priority AS priority,
                w.status AS status
         FROM public.worklist_items w
         JOIN public.enrollments e ON e.id = w.enrollment_id
         LEFT JOIN public.citizens c ON c.id = e.citizen_id
         LEFT JOIN public.events ev ON ev.id = w.event_id
         WHERE ${DashboardService.ASSIGNEE_SCOPE}
         ORDER BY w.due_date ASC NULLS LAST
         LIMIT 6`,
        [assignedTo],
      );
      return result.rows.map((row) => ({
        uhid: row.uhid,
        citizen: row.citizen,
        activity: row.activity,
        dueDate: row.due_date ? row.due_date.toISOString() : null,
        priority: row.priority,
        status: row.status,
      }));
    } catch (error) {
      this.logger.warn(`Dashboard worklist query failed: ${(error as Error).message}`);
      return [];
    }
  }
}
