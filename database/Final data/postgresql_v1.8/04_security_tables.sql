-- ============================================================================
-- DiNC Platform — PostgreSQL Implementation
-- File 04: Security tables (dinc_security)
-- Approved design : DiNC_PostgreSQL_Database_Design.md (Task 4)
-- Idempotent      : yes
-- DEPLOY ORDER    : runs BEFORE 03_runtime_tables.sql (runtime FKs point here);
--                   09_deploy.sql executes files in dependency order, not
--                   filename order.
--
-- Minimal principal scaffolding only: the approved design routes
-- followup_task.assigned_to, patient_condition.flagged_by/cleared_by,
-- outcome_response.recorded_by and call_log.called_by at security principals.
-- Fuller identity concerns (sessions, permissions) are out of clinical scope
-- per the approved design and are NOT invented here.
-- ============================================================================

CREATE TABLE IF NOT EXISTS dinc_security.app_user (
    user_id    uuid        NOT NULL DEFAULT gen_random_uuid(),
    username   text        NOT NULL,
    full_name  text        NOT NULL,
    role       text        NOT NULL DEFAULT 'CARE_MANAGER',
    is_active  boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_app_user          PRIMARY KEY (user_id),
    CONSTRAINT uq_app_user_username UNIQUE (username),
    CONSTRAINT ck_app_user_role     CHECK (role IN ('CARE_MANAGER', 'SUPERVISOR', 'ADMIN'))
);
COMMENT ON TABLE dinc_security.app_user IS
  'Operationally provisioned principals (not seeded from the workbook; not runtime-generated). Referenced by dinc_runtime actor columns and dinc_audit.audit_log.actor (softly).';
