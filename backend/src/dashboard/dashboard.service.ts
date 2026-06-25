import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ActivityItem,
  AdminDashboardSummary,
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
        "SELECT count(*)::int AS c FROM public.worklist_items WHERE status = 'PENDING'",
      ),
      this.count(
        "SELECT count(*)::int AS c FROM public.worklist_items WHERE status = 'PENDING' AND due_date < CURRENT_DATE",
      ),
      this.count(
        "SELECT count(*)::int AS c FROM public.worklist_items WHERE status = 'COMPLETED'",
      ),
      this.services(),
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
      recentActivity,
      recentWorklist,
    };
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
         LEFT JOIN public.enrollments e ON e.id = w.enrollment_id
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
