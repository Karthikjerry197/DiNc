import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PermissionsService } from '../rbac/permissions.service';
import { GuidebooksService } from '../guidebooks/guidebooks.service';
import { GuidebookResolution } from '../guidebooks/guidebooks.types';
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
 * DiNc migration Step 4: the worklist is now derived from the runtime model —
 * event_instance (the schedulable unit) → activity_instance (its checklist,
 * whose first incomplete row is the "current activity") → followup_task
 * (call-outcome follow-ups, surfaced as FOLLOW_UP items). Status derivation:
 * event_instance ACTIVE → PENDING (overdue when due_date < today), COMPLETED
 * stays COMPLETED, LOCKED stays LOCKED (scheduled but not yet actionable);
 * followup_task OPEN → PENDING, DONE → COMPLETED. Escalation is derived from
 * priority = 'URGENT'. Assignees are app_user ids resolved to usernames.
 *
 * Issues only SELECT statements. Each section is resolved independently and
 * defensively so a single failing query degrades to an empty state rather than
 * failing the whole page. Only a bounded number of rows is fetched (LIMIT).
 */
@Injectable()
export class WorklistService {
  private readonly logger = new Logger(WorklistService.name);
  private static readonly ITEM_LIMIT = 50;

  constructor(
    private readonly db: DatabaseService,
    private readonly guidebooks: GuidebooksService,
    private readonly cdseRepo: CdseRepository,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * Resolves the guidebook(s) for a single worklist item (an event_instance)
   * from its enrolment's programme and its event. Returns the primary guidebook
   * plus any related ones; throws 404 when the item does not exist.
   */
  async getGuidebookForItem(itemId: string): Promise<GuidebookResolution> {
    const result = await this.db.query<{
      program_id: string | null;
      disease_id: string | null;
      event_id: string | null;
      haystack: string;
    }>(
      `SELECT e.programme_id AS program_id,
              e.programme_id AS disease_id,
              ei.event_id AS event_id,
              COALESCE(pr.programme_name, '') || ' ' || COALESCE(pr.programme_code, '') || ' ' ||
              COALESCE(ev.event_name, '') AS haystack
       FROM dinc_runtime.event_instance ei
       JOIN dinc_runtime.programme_enrolment e ON e.enrolment_id = ei.enrolment_id
       LEFT JOIN dinc_metadata.programme pr ON pr.programme_id = e.programme_id
       LEFT JOIN dinc_metadata.event ev ON ev.event_id = ei.event_id
       WHERE ei.event_instance_id = $1
       LIMIT 1`,
      [itemId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Worklist item not found.');
    }
    return this.guidebooks.resolveForContext({
      programId: row.program_id,
      diseaseId: row.disease_id,
      eventId: row.event_id,
      haystack: row.haystack,
    });
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
    const scopeTo = (await this.permissions.has(
      { username: viewer.username, role: viewer.role },
      'worklist.view.all',
    ))
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
        `SELECT (a.total + b.total)::int AS total,
                (a.pending + b.pending)::int AS pending,
                (a.overdue + b.overdue)::int AS overdue,
                (a.due_today + b.due_today)::int AS due_today,
                (a.completed + b.completed)::int AS completed,
                (a.escalations + b.escalations)::int AS escalations
         FROM (
           SELECT count(*) AS total,
                  count(*) FILTER (WHERE ei.status = 'ACTIVE') AS pending,
                  count(*) FILTER (WHERE ei.status = 'ACTIVE' AND ei.due_date < CURRENT_DATE) AS overdue,
                  count(*) FILTER (WHERE ei.due_date = CURRENT_DATE) AS due_today,
                  count(*) FILTER (WHERE ei.status = 'COMPLETED') AS completed,
                  count(*) FILTER (WHERE ei.priority = 'URGENT' AND ei.status = 'ACTIVE') AS escalations
           FROM dinc_runtime.event_instance ei
           LEFT JOIN dinc_security.app_user au ON au.user_id = ei.assigned_to
           WHERE ($1::varchar IS NULL OR au.username = $1)
         ) a, (
           SELECT count(*) AS total,
                  count(*) FILTER (WHERE ft.status = 'OPEN') AS pending,
                  count(*) FILTER (WHERE ft.status = 'OPEN' AND ft.due_date < CURRENT_DATE) AS overdue,
                  count(*) FILTER (WHERE ft.due_date = CURRENT_DATE) AS due_today,
                  count(*) FILTER (WHERE ft.status = 'DONE') AS completed,
                  count(*) FILTER (WHERE ft.priority = 'URGENT' AND ft.status = 'OPEN') AS escalations
           FROM dinc_runtime.followup_task ft
           LEFT JOIN dinc_security.app_user au2 ON au2.user_id = ft.assigned_to
           WHERE ($1::varchar IS NULL OR au2.username = $1)
         ) b`,
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
        `SELECT t.* FROM (
           SELECT ei.event_instance_id AS id,
                  c.patient_id AS citizen_id,
                  c.external_id AS uhid,
                  c.full_name AS citizen,
                  pr.programme_name AS program,
                  NULL::text AS sub_program,
                  COALESCE(act.activity_name, ev.event_name) AS activity,
                  cond.condition_code AS type,
                  ei.due_date AS due_date,
                  0 AS retry_count,
                  COALESCE(ei.priority, 'NORMAL') AS priority,
                  (ei.priority = 'URGENT' AND ei.status = 'ACTIVE') AS is_escalation,
                  CASE ei.status WHEN 'ACTIVE' THEN 'PENDING' ELSE ei.status END AS status,
                  au.username AS assigned_to,
                  ei.created_at AS created_at
           FROM dinc_runtime.event_instance ei
           JOIN dinc_runtime.programme_enrolment e ON e.enrolment_id = ei.enrolment_id
           LEFT JOIN dinc_runtime.patient c ON c.patient_id = e.patient_id
           LEFT JOIN dinc_metadata.programme pr ON pr.programme_id = e.programme_id
           LEFT JOIN dinc_metadata.event ev ON ev.event_id = ei.event_id
           LEFT JOIN dinc_security.app_user au ON au.user_id = ei.assigned_to
           LEFT JOIN LATERAL (
             SELECT a.activity_name
             FROM dinc_runtime.activity_instance ai
             JOIN dinc_metadata.activity a ON a.activity_id = ai.activity_id
             WHERE ai.event_instance_id = ei.event_instance_id
               AND ai.completed_at IS NULL
             ORDER BY a.display_order
             LIMIT 1
           ) act ON true
           LEFT JOIN LATERAL (
             SELECT pc.condition_code
             FROM dinc_runtime.patient_condition pc
             WHERE pc.enrolment_id = e.enrolment_id AND pc.cleared_at IS NULL
             ORDER BY pc.flagged_at DESC
             LIMIT 1
           ) cond ON true

           UNION ALL

           SELECT ft.followup_task_id AS id,
                  c.patient_id,
                  c.external_id,
                  c.full_name,
                  pr.programme_name,
                  NULL::text,
                  'Follow-up call',
                  'FOLLOW_UP',
                  ft.due_date,
                  0,
                  COALESCE(ft.priority, 'NORMAL'),
                  (ft.priority = 'URGENT' AND ft.status = 'OPEN'),
                  CASE ft.status WHEN 'OPEN' THEN 'PENDING'
                                 WHEN 'DONE' THEN 'COMPLETED'
                                 ELSE ft.status END,
                  au.username,
                  ft.created_at
           FROM dinc_runtime.followup_task ft
           JOIN dinc_runtime.programme_enrolment e ON e.enrolment_id = ft.enrolment_id
           LEFT JOIN dinc_runtime.patient c ON c.patient_id = e.patient_id
           LEFT JOIN dinc_metadata.programme pr ON pr.programme_id = e.programme_id
           LEFT JOIN dinc_security.app_user au ON au.user_id = ft.assigned_to
         ) t
         WHERE ($1::varchar IS NULL OR t.assigned_to = $1)
         ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
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
        `SELECT programme_id AS id, programme_name AS name
         FROM dinc_metadata.programme
         ORDER BY display_order, programme_name
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
         FROM dinc_security.app_user
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
                (COALESCE(ei.pending, 0) + COALESCE(ft.pending, 0))::int AS pending
         FROM dinc_security.app_user u
         LEFT JOIN (
           SELECT assigned_to, count(*)::int AS pending
           FROM dinc_runtime.event_instance
           WHERE status = 'ACTIVE'
           GROUP BY assigned_to
         ) ei ON ei.assigned_to = u.user_id
         LEFT JOIN (
           SELECT assigned_to, count(*)::int AS pending
           FROM dinc_runtime.followup_task
           WHERE status = 'OPEN'
           GROUP BY assigned_to
         ) ft ON ft.assigned_to = u.user_id
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
