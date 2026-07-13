-- ============================================================================
-- DiNC Platform — PostgreSQL Implementation
-- File 09: Deployment orchestrator (idempotent, safely rerunnable)
-- Approved design : DiNC_PostgreSQL_Database_Design.md (Tasks 4/5) +
--                   Blueprint section 5 (seed waves, post-seed validation gate)
--
-- USAGE (psql, from this directory):
--     psql -v ON_ERROR_STOP=1 -d <database> -f 09_deploy.sql
--
-- RERUNNABILITY — why every step is safe to repeat:
--   01..05 : CREATE SCHEMA/TABLE/INDEX IF NOT EXISTS; CREATE OR REPLACE FUNCTION
--   06     : every INSERT is ON CONFLICT DO NOTHING; deterministic UUIDv5 keys
--            mean a re-run inserts nothing and can never duplicate or drift
--   07     : CREATE OR REPLACE VIEW
--   08     : read-only checks; the DO block RAISEs on any violation, so a
--            failed validation aborts the transaction and leaves nothing partial
--   Privileges below: GRANT/REVOKE are idempotent by nature
--
-- DEPLOYMENT ORDER (dependency order, not filename order):
--   02 before 03  : runtime FKs reference dinc_metadata tables
--   04 before 03  : runtime FKs reference dinc_security.app_user
--   06 before 08  : validation asserts seed completeness (row counts vs v1.8)
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

\ir 01_create_schemas.sql
\ir 02_metadata_tables.sql
\ir 04_security_tables.sql
\ir 03_runtime_tables.sql
\ir 05_audit_tables.sql

COMMIT;

-- Seed runs in its own transaction (06 contains BEGIN/COMMIT).
\ir 06_seed_metadata.sql

BEGIN;

\ir 07_views.sql

-- ----------------------------------------------------------------------------
-- Privileges (Design Task 4): the schema boundaries as grants.
--   dinc_app     : the application/engine role
--   dinc_auditor : read-only access to the audit trail
-- Roles are created only if absent (cluster-level objects; safe on re-run).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dinc_app') THEN
        CREATE ROLE dinc_app NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dinc_auditor') THEN
        CREATE ROLE dinc_auditor NOLOGIN;
    END IF;
END $$;

GRANT USAGE ON SCHEMA dinc_metadata, dinc_runtime, dinc_security, dinc_audit TO dinc_app;

-- The frozen specification: SELECT only. "Runtime never writes metadata" is a grant.
GRANT SELECT ON ALL TABLES IN SCHEMA dinc_metadata TO dinc_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA dinc_metadata FROM dinc_app;

-- Patient state: full DML.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA dinc_runtime TO dinc_app;

-- Principals: read + provisioning updates.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA dinc_security TO dinc_app;

-- Audit: append-only by privilege — INSERT, never UPDATE/DELETE.
GRANT SELECT, INSERT ON dinc_audit.audit_log TO dinc_app;
REVOKE UPDATE, DELETE, TRUNCATE ON dinc_audit.audit_log FROM dinc_app;

-- Auditors: audit trail only; no patient-state access.
GRANT USAGE ON SCHEMA dinc_audit TO dinc_auditor;
GRANT SELECT ON dinc_audit.audit_log TO dinc_auditor;

COMMIT;

-- ----------------------------------------------------------------------------
-- Validation gate LAST: raises (and exits non-zero) on any violation.
-- ----------------------------------------------------------------------------
\ir 08_validation.sql

\echo 'DiNC v1.8 deployment complete: schemas, 21 metadata tables (seeded), 9 runtime tables, security, audit, resolver views, privileges — validation PASSED.'
