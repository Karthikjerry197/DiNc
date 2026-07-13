import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  AlertEntryDto,
  CreateDuplicateRequestInput,
  DuplicateDecision,
  DuplicateRequestRow,
  DuplicateRequestStatus,
  DuplicateResolution,
  PatientDemographics,
  StatusHistoryRow,
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
        `CREATE TABLE IF NOT EXISTS dinc_app.duplicate_requests (
           id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
           ON dinc_app.duplicate_requests (status)`,
      );

      // Administrator Review Workspace columns (additive, idempotent): the review
      // decision, the reviewer's comments, and a last-updated timestamp. `remarks`
      // is retained for backward compatibility; `review_comments` is the canonical
      // reviewer-comment column going forward.
      await this.db.query(
        `ALTER TABLE dinc_app.duplicate_requests
           ADD COLUMN IF NOT EXISTS decision character varying(30),
           ADD COLUMN IF NOT EXISTS review_comments text,
           ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL`,
      );

      // Append-only status timeline — one row per transition, for full audit.
      await this.db.query(
        `CREATE TABLE IF NOT EXISTS dinc_app.duplicate_request_status_history (
           id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
           request_id uuid NOT NULL REFERENCES dinc_app.duplicate_requests(id) ON DELETE CASCADE,
           from_status character varying(30),
           to_status character varying(30) NOT NULL,
           decision character varying(30),
           comments text,
           actor character varying(100),
           created_at timestamp with time zone DEFAULT now() NOT NULL
         )`,
      );
      await this.db.query(
        `CREATE INDEX IF NOT EXISTS idx_dup_status_history_request
           ON dinc_app.duplicate_request_status_history (request_id, created_at)`,
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

  /**
   * Inserts a new duplicate request and seeds its status timeline with the
   * initial PENDING entry — both in one transaction so a request always has a
   * complete, gap-free audit trail.
   */
  async insert(input: CreateDuplicateRequestInput): Promise<string> {
    return this.db.withTransaction(async (tx) => {
      const result = await tx.query<{ id: string }>(
        `INSERT INTO dinc_app.duplicate_requests
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
      const id = result.rows[0].id;
      await tx.query(
        `INSERT INTO dinc_app.duplicate_request_status_history
           (request_id, from_status, to_status, decision, comments, actor)
         VALUES ($1, NULL, 'PENDING', NULL, $2, $3)`,
        [id, input.comments, input.submittedBy],
      );
      return id;
    });
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
      `UPDATE dinc_app.duplicate_requests
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
      `UPDATE dinc_app.duplicate_requests
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

  /**
   * Records an Administrator Review decision. Atomically: transitions a PENDING
   * request to the resulting status (recording decision, reviewer, comments and
   * updated_at) AND appends a status-history entry. Returns the updated row, or
   * null when the request was not PENDING (already reviewed) so the caller can
   * surface a clean conflict. No citizen record is ever modified here — a
   * CONFIRMED_DUPLICATE only marks intent for the future archive/merge milestone.
   */
  async decide(
    id: string,
    toStatus: DuplicateRequestStatus,
    decision: DuplicateDecision,
    reviewedBy: string,
    comments: string,
  ): Promise<DuplicateRequestRow | null> {
    return this.db.withTransaction(async (tx) => {
      const updated = await tx.query<{ id: string }>(
        `UPDATE dinc_app.duplicate_requests
           SET status = $2,
               decision = $3,
               reviewed_by = $4,
               reviewed_at = now(),
               review_comments = $5,
               updated_at = now()
         WHERE id = $1 AND status = 'PENDING'
         RETURNING id`,
        [id, toStatus, decision, reviewedBy, comments],
      );
      if (updated.rows.length === 0) return null;

      await tx.query(
        `INSERT INTO dinc_app.duplicate_request_status_history
           (request_id, from_status, to_status, decision, comments, actor)
         VALUES ($1, 'PENDING', $2, $3, $4, $5)`,
        [id, toStatus, decision, comments, reviewedBy],
      );

      const result = await tx.query<DuplicateRequestRow>(
        `${DataQualityRepository.SELECT_REQUEST}
         WHERE r.id = $1
         LIMIT 1`,
        [id],
      );
      return result.rows[0] ?? null;
    });
  }

  /** The append-only status timeline for a request, oldest first. */
  async findStatusHistory(id: string): Promise<StatusHistoryRow[]> {
    const result = await this.db.query<StatusHistoryRow>(
      `SELECT id, request_id, from_status, to_status, decision, comments, actor, created_at
       FROM dinc_app.duplicate_request_status_history
       WHERE request_id = $1
       ORDER BY created_at ASC, id ASC`,
      [id],
    );
    return result.rows;
  }

  /** Extended demographics for the comparison. ABHA is not yet captured (null). */
  async findDemographics(citizenId: string): Promise<PatientDemographics | null> {
    try {
      const result = await this.db.query<{
        uhid: string | null;
        full_name: string | null;
        age: number | null;
        gender: string | null;
        phone: string | null;
        district: string | null;
        aadhaar: string | null;
        village: string | null;
        address: string | null;
        date_of_birth: Date | null;
      }>(
        `SELECT uhid, full_name, age, gender, phone, district,
                aadhaar, village, address, date_of_birth
         FROM public.citizens
         WHERE id = $1
         LIMIT 1`,
        [citizenId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        uhid: row.uhid,
        abha: null,
        aadhaar: row.aadhaar,
        fullName: row.full_name,
        dateOfBirth: row.date_of_birth ? row.date_of_birth.toISOString().slice(0, 10) : null,
        age: row.age,
        gender: row.gender,
        mobile: row.phone,
        address: row.address,
        village: row.village,
        district: row.district,
      };
    } catch (error) {
      this.logger.warn(`Demographics lookup failed for ${citizenId}: ${(error as Error).message}`);
      return null;
    }
  }

  /** Active clinical alerts for a citizen (Clinical Information). Degrades to []. */
  async findActiveAlerts(citizenId: string): Promise<AlertEntryDto[]> {
    try {
      const result = await this.db.query<{
        id: string;
        disease: string | null;
        risk_level: string | null;
        status: string;
        triggered_at: Date | null;
      }>(
        `SELECT id, disease, risk_level, status, triggered_at
         FROM dinc_app.clinical_alerts
         WHERE citizen_id = $1 AND status = 'ACTIVE'
         ORDER BY triggered_at DESC NULLS LAST
         LIMIT 20`,
        [citizenId],
      );
      return result.rows.map((r) => ({
        id: r.id,
        disease: r.disease,
        riskLevel: r.risk_level,
        status: r.status,
        triggeredAt: r.triggered_at ? r.triggered_at.toISOString() : null,
      }));
    } catch (error) {
      this.logger.warn(`Alerts lookup failed for ${citizenId}: ${(error as Error).message}`);
      return [];
    }
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
           r.decision,
           r.resolution,
           r.submitted_by,
           r.submitted_at,
           r.reviewed_by,
           r.reviewed_at,
           r.review_comments,
           r.remarks,
           r.updated_at
    FROM dinc_app.duplicate_requests r
    LEFT JOIN public.citizens cc ON cc.id = r.current_citizen_id
    LEFT JOIN public.citizens dc ON dc.id = r.duplicate_citizen_id`;
}
