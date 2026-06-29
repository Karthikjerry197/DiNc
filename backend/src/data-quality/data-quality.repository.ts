import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  CreateDuplicateRequestInput,
  DuplicateRequestRow,
  DuplicateResolution,
} from './data-quality.types';

/**
 * Data-access layer for the Data Quality / Duplicate Request workflow. This is
 * the ONLY place that holds SQL for the feature; every statement is parameterised.
 *
 * Unlike the read-only modules, this feature owns a table. The table is created
 * idempotently on startup (CREATE TABLE IF NOT EXISTS) so the workflow works
 * out-of-the-box on an existing `cphc` database without a separate migration
 * runner. The same DDL is also shipped as scripts/duplicate_requests.sql for
 * teams that prefer to apply it manually.
 */
@Injectable()
export class DataQualityRepository implements OnModuleInit {
  private readonly logger = new Logger(DataQualityRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  /** Creates the duplicate_requests table if it is not already present. */
  private async ensureSchema(): Promise<void> {
    try {
      await this.db.query(
        `CREATE TABLE IF NOT EXISTS public.duplicate_requests (
           id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
           current_citizen_id uuid NOT NULL,
           duplicate_citizen_id uuid NOT NULL,
           reason character varying(60) NOT NULL,
           comments text,
           status character varying(15) DEFAULT 'PENDING' NOT NULL,
           resolution character varying(10),
           submitted_by character varying(100) NOT NULL,
           submitted_at timestamp with time zone DEFAULT now() NOT NULL,
           reviewed_by character varying(100),
           reviewed_at timestamp with time zone,
           remarks text
         )`,
      );
      await this.db.query(
        `CREATE INDEX IF NOT EXISTS idx_duplicate_requests_status
           ON public.duplicate_requests (status)`,
      );
    } catch (error) {
      // Never crash the app on a DDL hiccup (e.g. restricted role): the feature
      // degrades gracefully and the error is surfaced in the logs.
      this.logger.error(
        `Failed to ensure duplicate_requests schema: ${(error as Error).message}`,
      );
    }
  }

  /** Confirms a citizen exists (used to validate request submissions). */
  async citizenExists(citizenId: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM public.citizens WHERE id = $1) AS exists`,
      [citizenId],
    );
    return result.rows[0]?.exists ?? false;
  }

  /** Inserts a new duplicate request and returns its id. */
  async insert(input: CreateDuplicateRequestInput): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO public.duplicate_requests
         (current_citizen_id, duplicate_citizen_id, reason, comments, submitted_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.currentCitizenId,
        input.duplicateCitizenId,
        input.reason,
        input.comments,
        input.submittedBy,
      ],
    );
    return result.rows[0].id;
  }

  /** All requests, newest first, joined to both citizens for display. */
  async findAll(): Promise<DuplicateRequestRow[]> {
    const result = await this.db.query<DuplicateRequestRow>(
      `${DataQualityRepository.SELECT_REQUEST}
       ORDER BY r.submitted_at DESC
       LIMIT 200`,
    );
    return result.rows;
  }

  /** A single request by id, or null when not found. */
  async findById(id: string): Promise<DuplicateRequestRow | null> {
    const result = await this.db.query<DuplicateRequestRow>(
      `${DataQualityRepository.SELECT_REQUEST}
       WHERE r.id = $1
       LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Records a review decision (APPROVED/REJECTED) with the reviewer and remarks.
   * Only transitions a request that is still PENDING; returns the updated row or
   * null when the request no longer qualifies (e.g. already reviewed).
   */
  async review(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    reviewedBy: string,
    remarks: string | null,
  ): Promise<DuplicateRequestRow | null> {
    const updated = await this.db.query<{ id: string }>(
      `UPDATE public.duplicate_requests
         SET status = $2,
             reviewed_by = $3,
             reviewed_at = now(),
             remarks = $4
       WHERE id = $1 AND status = 'PENDING'
       RETURNING id`,
      [id, status, reviewedBy, remarks],
    );
    if (updated.rows.length === 0) return null;
    return this.findById(id);
  }

  /**
   * Records the resolution (MERGED/DELETED) of an APPROVED request. Returns the
   * updated row or null when the request is not in the APPROVED state.
   */
  async resolve(
    id: string,
    resolution: DuplicateResolution,
    reviewedBy: string,
    remarks: string | null,
  ): Promise<DuplicateRequestRow | null> {
    const updated = await this.db.query<{ id: string }>(
      `UPDATE public.duplicate_requests
         SET status = 'RESOLVED',
             resolution = $2,
             reviewed_by = $3,
             reviewed_at = now(),
             remarks = COALESCE($4, remarks)
       WHERE id = $1 AND status = 'APPROVED'
       RETURNING id`,
      [id, resolution, reviewedBy, remarks],
    );
    if (updated.rows.length === 0) return null;
    return this.findById(id);
  }

  /** Shared SELECT projecting a request joined to both citizens. */
  private static readonly SELECT_REQUEST = `
    SELECT r.id,
           r.current_citizen_id,
           cc.uhid AS current_uhid,
           cc.full_name AS current_name,
           r.duplicate_citizen_id,
           dc.uhid AS duplicate_uhid,
           dc.full_name AS duplicate_name,
           r.reason,
           r.comments,
           r.status,
           r.resolution,
           r.submitted_by,
           r.submitted_at,
           r.reviewed_by,
           r.reviewed_at,
           r.remarks
    FROM public.duplicate_requests r
    LEFT JOIN public.citizens cc ON cc.id = r.current_citizen_id
    LEFT JOIN public.citizens dc ON dc.id = r.duplicate_citizen_id`;
}
