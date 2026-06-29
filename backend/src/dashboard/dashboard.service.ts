import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ActivityItem,
  AdminDashboardSummary,
  ProgramSummaryItem,
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

  constructor(private readonly db: DatabaseService) {}

  async getAdminSummary(): Promise<AdminDashboardSummary> {
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
         WHERE w.status = 'PENDING' AND ${DashboardService.LINKED_ENROLLMENT}`,
      ),
      this.count(
        `SELECT count(*)::int AS c FROM public.worklist_items w
         WHERE w.status = 'PENDING' AND w.due_date < CURRENT_DATE AND ${DashboardService.LINKED_ENROLLMENT}`,
      ),
      this.count(
        `SELECT count(*)::int AS c FROM public.worklist_items w
         WHERE w.status = 'COMPLETED' AND ${DashboardService.LINKED_ENROLLMENT}`,
      ),
      this.services(),
      this.programs(),
      this.recentActivity(),
      this.recentWorklist(),
    ]);

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
      worklist: {
        pending: pendingTasks,
        overdue: overdueTasks,
        completed: completedTasks,
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

  /** Runs a single-row `count(*) AS c` query, returning the count or `null` on failure. */
  private async count(sql: string): Promise<number | null> {
    try {
      const result = await this.db.query<{ c: number }>(sql);
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
           SELECT 'CITIZEN'::text AS kind,
                  COALESCE(full_name, uhid) AS title,
                  'Citizen registered'::text AS subtitle,
                  created_at AS at
             FROM public.citizens
           UNION ALL
           SELECT 'ENROLLMENT'::text,
                  COALESCE(c.full_name, c.uhid),
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

  /** A handful of upcoming worklist items, joined to citizen + activity for context. */
  private async recentWorklist(): Promise<WorklistRow[]> {
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
         ORDER BY w.due_date ASC NULLS LAST
         LIMIT 6`,
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
