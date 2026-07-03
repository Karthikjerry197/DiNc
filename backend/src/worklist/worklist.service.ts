import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { hasPermission } from '../auth/permissions';
import { DatabaseService } from '../database/database.service';
import { GuidebooksService } from '../guidebooks/guidebooks.service';
import { GuidebookRef } from '../guidebooks/guidebooks.types';
import {
  AssigneeOption,
  MonitoringEntry,
  ProgramOption,
  WorklistItem,
  WorklistOverview,
  WorklistStats,
} from './worklist.types';
import { CdseRepository } from '../cdse/cdse.repository';

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

  /**
   * Data-integrity guard: only count/show worklist items still linked to an
   * existing enrollment, so orphaned items never appear with missing context.
   */
  private static readonly LINKED_ENROLLMENT =
    'EXISTS (SELECT 1 FROM public.enrollments en WHERE en.id = w.enrollment_id)';

  constructor(
    private readonly db: DatabaseService,
    private readonly guidebooks: GuidebooksService,
    private readonly cdseRepo: CdseRepository,
  ) {}

  /**
   * Resolves the guidebook for a single worklist item using its own
   * program/disease/event (falling back to the item's enrollment). Returns the
   * matched guidebook or null; throws 404 when the item does not exist.
   */
  async getGuidebookForItem(itemId: string): Promise<{ guidebook: GuidebookRef | null }> {
    const result = await this.db.query<{ haystack: string }>(
      `SELECT COALESCE(p.name, '') || ' ' || COALESCE(p.code, '') || ' ' ||
              COALESCE(d.name, '') || ' ' || COALESCE(d.code, '') || ' ' ||
              COALESCE(ev.name, '') AS haystack
       FROM public.worklist_items w
       LEFT JOIN public.enrollments e ON e.id = w.enrollment_id
       LEFT JOIN public.programs p ON p.id = COALESCE(w.program_id, e.program_id)
       LEFT JOIN public.diseases d ON d.id = COALESCE(w.disease_id, e.disease_id)
       LEFT JOIN public.events ev ON ev.id = w.event_id
       WHERE w.id = $1
       LIMIT 1`,
      [itemId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Worklist item not found.');
    }
    const guidebook = await this.guidebooks.matchByText(row.haystack);
    return { guidebook };
  }

  /**
   * The Worklist page payload, scoped by permission (M31): viewers holding
   * `worklist.view.all` see every item; everyone else sees only the items
   * assigned to them ("My Worklist" is literal). The scope is permission-keyed,
   * not role-keyed, so it can later be driven by configurable permissions.
   */
  async getAdminOverview(viewer: {
    username: string;
    role: string;
  }): Promise<WorklistOverview> {
    const scopeTo = hasPermission(viewer.role, 'worklist.view.all')
      ? null
      : viewer.username;
    const [stats, items, programs, assignees, monitoring] = await Promise.all([
      this.stats(scopeTo),
      this.items(scopeTo),
      this.programs(),
      this.assignees(),
      this.monitoring(),
    ]);

    // Enrich items with clinical risk level from active alerts
    const citizenIds = [...new Set(items.map((i) => i.citizenId).filter(Boolean) as string[])];
    const riskMap = await this.cdseRepo.getRiskMapForCitizens(citizenIds).catch(() => new Map());
    const enriched = items.map((item) => ({
      ...item,
      riskLevel: item.citizenId ? (riskMap.get(item.citizenId)?.riskLevel ?? null) : null,
    }));

    return { stats, items: enriched, programs, assignees, monitoring };
  }

  /** Optional viewer scope: when `assignedTo` is set, only that user's items count. */
  private async stats(assignedTo: string | null): Promise<WorklistStats> {
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
         FROM public.worklist_items w
         WHERE ${WorklistService.LINKED_ENROLLMENT}
           AND ($1::varchar IS NULL OR w.assigned_to = $1)`,
        [assignedTo],
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

  /** Optional viewer scope: when `assignedTo` is set, only that user's items list. */
  private async items(assignedTo: string | null): Promise<WorklistItem[]> {
    try {
      const result = await this.db.query<{
        id: string;
        citizen_id: string | null;
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
                c.id AS citizen_id,
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
         JOIN public.enrollments e ON e.id = w.enrollment_id
         LEFT JOIN public.citizens c ON c.id = e.citizen_id
         LEFT JOIN public.programs p ON p.id = COALESCE(w.program_id, e.program_id)
         LEFT JOIN public.diseases d ON d.id = w.disease_id
         LEFT JOIN public.sub_programs sp ON sp.id = d.sub_program_id
         LEFT JOIN public.events ev ON ev.id = w.event_id
         WHERE ($1::varchar IS NULL OR w.assigned_to = $1)
         ORDER BY w.due_date ASC NULLS LAST, w.created_at DESC
         LIMIT ${WorklistService.ITEM_LIMIT}`,
        [assignedTo],
      );
      return result.rows.map((row) => ({
        id: row.id,
        citizenId: row.citizen_id,
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
        riskLevel: null,
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
           SELECT w.assigned_to, count(*) FILTER (WHERE w.status = 'PENDING')::int AS pending
           FROM public.worklist_items w
           WHERE ${WorklistService.LINKED_ENROLLMENT}
           GROUP BY w.assigned_to
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
