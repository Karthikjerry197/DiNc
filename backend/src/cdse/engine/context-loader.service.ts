import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type {
  ActiveProgramInfo,
  ClinicalContext,
  OverdueWorklistItem,
  RecentOutcomeDatum,
} from '../cdse.types';

/**
 * Builds a ClinicalContext from existing tables — no new schema needed.
 *
 * All queries are read-only and defensive: a failing query returns an empty
 * result rather than crashing the engine. The context is assembled from:
 *   • citizens          — age, gender
 *   • enrollments       — active programme memberships
 *   • programs          — programme names
 *   • diseases          — disease names
 *   • worklist_items    — overdue follow-ups
 *   • outcome_records   — consultation history and clinical field values
 */
@Injectable()
export class ContextLoaderService {
  constructor(private readonly db: DatabaseService) {}

  async load(citizenId: string): Promise<ClinicalContext> {
    const [citizen, programs, overdueItems, lastAt, consultCount, recentOutcomes] =
      await Promise.all([
        this.loadCitizen(citizenId),
        this.loadActivePrograms(citizenId),
        this.loadOverdueWorklist(citizenId),
        this.loadLastConsultationAt(citizenId),
        this.loadConsultationCount(citizenId),
        this.loadRecentOutcomes(citizenId),
      ]);

    const daysSinceLastConsultation = lastAt
      ? Math.floor((Date.now() - new Date(lastAt).getTime()) / 86_400_000)
      : null;

    return {
      citizen: citizen ?? { id: citizenId, age: null, gender: null },
      activePrograms: programs,
      overdueWorklist: overdueItems,
      daysSinceLastConsultation,
      totalConsultations: consultCount,
      recentOutcomeData: recentOutcomes,
    };
  }

  private async loadCitizen(
    citizenId: string,
  ): Promise<{ id: string; age: number | null; gender: string | null } | null> {
    try {
      const r = await this.db.query<{ id: string; age: number | null; gender: string | null }>(
        'SELECT id, age, gender FROM citizens WHERE id = $1',
        [citizenId],
      );
      return r.rows[0] ?? null;
    } catch {
      return null;
    }
  }

  private async loadActivePrograms(citizenId: string): Promise<ActiveProgramInfo[]> {
    try {
      const r = await this.db.query<{
        enrollment_id: string;
        program_name: string;
        disease_name: string | null;
        start_date: Date | null;
      }>(
        `SELECT e.id        AS enrollment_id,
                p.name      AS program_name,
                d.name      AS disease_name,
                e.start_date
         FROM   enrollments e
         JOIN   programs p ON p.id = e.program_id
         LEFT JOIN diseases d ON d.id = e.disease_id
         WHERE  e.citizen_id = $1 AND e.status = 'ACTIVE'
         ORDER  BY e.start_date DESC`,
        [citizenId],
      );
      return r.rows.map((row) => ({
        enrollmentId: row.enrollment_id,
        programName: row.program_name,
        diseaseName: row.disease_name,
        startDate: row.start_date ? row.start_date.toISOString().split('T')[0] : null,
      }));
    } catch {
      return [];
    }
  }

  private async loadOverdueWorklist(citizenId: string): Promise<OverdueWorklistItem[]> {
    try {
      const today = Date.now();
      const r = await this.db.query<{ id: string; due_date: Date | null; status: string }>(
        `SELECT w.id, w.due_date, w.status
         FROM   worklist_items w
         JOIN   enrollments e ON e.id = w.enrollment_id
         WHERE  e.citizen_id = $1
           AND  w.status IN ('PENDING', 'IN_PROGRESS')
           AND  w.due_date < CURRENT_DATE
         ORDER  BY w.due_date ASC
         LIMIT  20`,
        [citizenId],
      );
      return r.rows.map((row) => ({
        id: row.id,
        dueDate: row.due_date ? row.due_date.toISOString().split('T')[0] : null,
        daysOverdue: row.due_date
          ? Math.floor((today - new Date(row.due_date).getTime()) / 86_400_000)
          : 0,
        status: row.status,
      }));
    } catch {
      return [];
    }
  }

  private async loadLastConsultationAt(citizenId: string): Promise<string | null> {
    try {
      const r = await this.db.query<{ last_at: Date | null }>(
        `SELECT MAX(w.outcome_recorded_at) AS last_at
         FROM   worklist_items w
         JOIN   enrollments e ON e.id = w.enrollment_id
         WHERE  e.citizen_id = $1
           AND  w.outcome_recorded_at IS NOT NULL`,
        [citizenId],
      );
      return r.rows[0]?.last_at ? r.rows[0].last_at.toISOString() : null;
    } catch {
      return null;
    }
  }

  private async loadConsultationCount(citizenId: string): Promise<number> {
    try {
      const r = await this.db.query<{ c: number }>(
        `SELECT count(orr.id)::int AS c
         FROM   outcome_records orr
         JOIN   worklist_items w ON w.id = orr.worklist_item_id
         JOIN   enrollments e   ON e.id = w.enrollment_id
         WHERE  e.citizen_id = $1`,
        [citizenId],
      );
      return r.rows[0]?.c ?? 0;
    } catch {
      return 0;
    }
  }

  private async loadRecentOutcomes(citizenId: string): Promise<RecentOutcomeDatum[]> {
    try {
      const r = await this.db.query<{ recorded_at: Date; data: Record<string, unknown> }>(
        `SELECT orr.recorded_at, orr.data
         FROM   outcome_records orr
         JOIN   worklist_items w ON w.id = orr.worklist_item_id
         JOIN   enrollments e   ON e.id = w.enrollment_id
         WHERE  e.citizen_id = $1
         ORDER  BY orr.recorded_at DESC
         LIMIT  5`,
        [citizenId],
      );
      return r.rows.map((row) => {
        const raw = (row.data ?? {}) as Record<string, unknown>;
        const fields = (raw['fields'] as Record<string, unknown> | undefined) ?? {};
        return { recordedAt: row.recorded_at.toISOString(), fields, rawData: raw };
      });
    } catch {
      return [];
    }
  }
}
