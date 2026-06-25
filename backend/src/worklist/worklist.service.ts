import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  AssigneeOption,
  MonitoringEntry,
  ProgramOption,
  WorklistItem,
  WorklistOverview,
  WorklistStats,
} from './worklist.types';

/**
 * Read-only data source for the Worklist page.
 *
 * Issues only SELECT statements against existing tables. Each section is
 * resolved independently and defensively so a single failing query degrades to
 * an empty state rather than failing the whole page. Only a bounded number of
 * rows is fetched (LIMIT) — no large dataset is preloaded.
 */
@Injectable()
export class WorklistService {
  private readonly logger = new Logger(WorklistService.name);
  private static readonly ITEM_LIMIT = 50;

  constructor(private readonly db: DatabaseService) {}

  async getAdminOverview(): Promise<WorklistOverview> {
    const [stats, items, programs, assignees, monitoring] = await Promise.all([
      this.stats(),
      this.items(),
      this.programs(),
      this.assignees(),
      this.monitoring(),
    ]);

    return { stats, items, programs, assignees, monitoring };
  }

  private async stats(): Promise<WorklistStats> {
    const empty: WorklistStats = {
      total: null,
      pending: null,
      overdue: null,
      dueToday: null,
      completed: null,
      escalations: null,
    };
    try {
      const result = await this.db.query<{
        total: number;
        pending: number;
        overdue: number;
        due_today: number;
        completed: number;
        escalations: number;
      }>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
                count(*) FILTER (WHERE status = 'PENDING' AND due_date < CURRENT_DATE)::int AS overdue,
                count(*) FILTER (WHERE due_date = CURRENT_DATE)::int AS due_today,
                count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
                count(*) FILTER (WHERE is_escalation = true)::int AS escalations
         FROM public.worklist_items`,
      );
      const row = result.rows[0];
      if (!row) return empty;
      return {
        total: row.total,
        pending: row.pending,
        overdue: row.overdue,
        dueToday: row.due_today,
        completed: row.completed,
        escalations: row.escalations,
      };
    } catch (error) {
      this.logger.warn(`Worklist stats query failed: ${(error as Error).message}`);
      return empty;
    }
  }

  private async items(): Promise<WorklistItem[]> {
    try {
      const result = await this.db.query<{
        id: string;
        uhid: string | null;
        citizen: string | null;
        program: string | null;
        sub_program: string | null;
        activity: string | null;
        type: string | null;
        due_date: Date | null;
        retry_count: number;
        priority: string;
        is_escalation: boolean;
        status: string;
        assigned_to: string | null;
      }>(
        `SELECT w.id,
                c.uhid AS uhid,
                c.full_name AS citizen,
                p.name AS program,
                sp.name AS sub_program,
                ev.name AS activity,
                d.name AS type,
                w.due_date AS due_date,
                w.retry_count AS retry_count,
                w.priority AS priority,
                w.is_escalation AS is_escalation,
                w.status AS status,
                w.assigned_to AS assigned_to
         FROM public.worklist_items w
         LEFT JOIN public.enrollments e ON e.id = w.enrollment_id
         LEFT JOIN public.citizens c ON c.id = e.citizen_id
         LEFT JOIN public.programs p ON p.id = COALESCE(w.program_id, e.program_id)
         LEFT JOIN public.diseases d ON d.id = w.disease_id
         LEFT JOIN public.sub_programs sp ON sp.id = d.sub_program_id
         LEFT JOIN public.events ev ON ev.id = w.event_id
         ORDER BY w.due_date ASC NULLS LAST, w.created_at DESC
         LIMIT ${WorklistService.ITEM_LIMIT}`,
      );
      return result.rows.map((row) => ({
        id: row.id,
        uhid: row.uhid,
        citizen: row.citizen,
        program: row.program,
        subProgram: row.sub_program,
        activity: row.activity,
        type: row.type,
        dueDate: row.due_date ? row.due_date.toISOString() : null,
        reminders: row.retry_count ?? 0,
        priority: row.priority,
        isEscalation: row.is_escalation,
        status: row.status,
        assignedTo: row.assigned_to,
      }));
    } catch (error) {
      this.logger.warn(`Worklist items query failed: ${(error as Error).message}`);
      return [];
    }
  }

  private async programs(): Promise<ProgramOption[]> {
    try {
      const result = await this.db.query<ProgramOption>(
        `SELECT id, name
         FROM public.programs
         WHERE is_active = true
         ORDER BY name
         LIMIT 100`,
      );
      return result.rows;
    } catch (error) {
      this.logger.warn(`Worklist programs query failed: ${(error as Error).message}`);
      return [];
    }
  }

  private async assignees(): Promise<AssigneeOption[]> {
    try {
      const result = await this.db.query<{ username: string; full_name: string }>(
        `SELECT username, full_name
         FROM public.users
         WHERE is_active = true
         ORDER BY full_name
         LIMIT 200`,
      );
      return result.rows.map((row) => ({ username: row.username, fullName: row.full_name }));
    } catch (error) {
      this.logger.warn(`Worklist assignees query failed: ${(error as Error).message}`);
      return [];
    }
  }

  private async monitoring(): Promise<MonitoringEntry[]> {
    try {
      const result = await this.db.query<{
        username: string;
        full_name: string;
        role: string;
        pending: number;
      }>(
        `SELECT u.username,
                u.full_name,
                u.role,
                COALESCE(cnt.pending, 0)::int AS pending
         FROM public.users u
         LEFT JOIN (
           SELECT assigned_to, count(*) FILTER (WHERE status = 'PENDING')::int AS pending
           FROM public.worklist_items
           GROUP BY assigned_to
         ) cnt ON cnt.assigned_to = u.username
         WHERE u.is_active = true
         ORDER BY u.full_name
         LIMIT 50`,
      );
      return result.rows.map((row) => ({
        username: row.username,
        fullName: row.full_name,
        role: row.role,
        pending: row.pending,
      }));
    } catch (error) {
      this.logger.warn(`Worklist monitoring query failed: ${(error as Error).message}`);
      return [];
    }
  }
}
