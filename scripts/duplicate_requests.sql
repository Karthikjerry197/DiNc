-- ─────────────────────────────────────────────────────────────────────────────
-- Data Quality: Duplicate Request workflow
--
-- This table backs the worker → review → resolve duplicate-patient workflow.
-- The backend creates it automatically on startup (CREATE TABLE IF NOT EXISTS in
-- DataQualityRepository.onModuleInit), so applying this script manually is
-- OPTIONAL — it is provided for teams that manage schema out-of-band.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.duplicate_requests (
    id                   uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    current_citizen_id   uuid NOT NULL,
    duplicate_citizen_id uuid NOT NULL,
    reason               character varying(60) NOT NULL,
    comments             text,
    -- PENDING → APPROVED | REJECTED ; APPROVED → RESOLVED
    status               character varying(15) DEFAULT 'PENDING' NOT NULL,
    -- MERGED | DELETED (set only when status = RESOLVED)
    resolution           character varying(10),
    -- Audit trail
    submitted_by         character varying(100) NOT NULL,
    submitted_at         timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by          character varying(100),
    reviewed_at          timestamp with time zone,
    remarks              text
);

CREATE INDEX IF NOT EXISTS idx_duplicate_requests_status
    ON public.duplicate_requests (status);
