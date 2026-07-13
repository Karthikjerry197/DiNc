-- =====================================================================
-- DiNC Migration Step 0+1 — Foundation provisioning (idempotent)
-- Target database: DiNc
-- Per docs/MIGRATION_ANALYSIS_v1.md §3a (approved decisions D1–D5).
-- Does NOT touch dinc_metadata. No PK/FK/relationship changes to
-- existing tables. Additive only.
-- =====================================================================

-- D2: fifth schema for backend-owned operational tables
CREATE SCHEMA IF NOT EXISTS dinc_app;

-- D1: credential storage separate from app_user (identity/profile only)
CREATE TABLE IF NOT EXISTS dinc_security.user_credential (
  credential_id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL UNIQUE REFERENCES dinc_security.app_user(user_id),
  password_hash       text        NOT NULL,
  password_algorithm  text        NOT NULL DEFAULT 'bcrypt',
  password_changed_at timestamptz,
  failed_login_count  integer     NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  last_login_at       timestamptz,
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- D4: additive nullable operational demographics on patient
ALTER TABLE dinc_runtime.patient
  ADD COLUMN IF NOT EXISTS aadhaar  varchar(20),
  ADD COLUMN IF NOT EXISTS district varchar(120),
  ADD COLUMN IF NOT EXISTS village  varchar(120);

-- D5: additive nullable operational fields on event_instance
ALTER TABLE dinc_runtime.event_instance
  ADD COLUMN IF NOT EXISTS assigned_to         uuid,
  ADD COLUMN IF NOT EXISTS assigned_team       text,
  ADD COLUMN IF NOT EXISTS priority            text,
  ADD COLUMN IF NOT EXISTS metadata_release_id text;
