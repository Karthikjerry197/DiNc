-- ============================================================================
-- DiNC Platform — PostgreSQL Implementation
-- File 01: Schemas
-- Source of truth : DiNC_Metadata_Master_v1.8.xlsx (frozen)
-- Approved design : DiNC_PostgreSQL_Database_Design.md (Task 4)
-- Requires        : PostgreSQL 13+ (gen_random_uuid)
-- Idempotent      : yes (IF NOT EXISTS throughout)
-- ============================================================================

-- The frozen specification. Application role receives SELECT only (see 08_privileges.sql).
CREATE SCHEMA IF NOT EXISTS dinc_metadata;
COMMENT ON SCHEMA dinc_metadata IS
  'DiNC frozen metadata (seeded from DiNC_Metadata_Master_v1.8.xlsx). Read-only to the application; changes arrive only as versioned release migrations.';

-- Patient state and operations. Application read-write.
CREATE SCHEMA IF NOT EXISTS dinc_runtime;
COMMENT ON SCHEMA dinc_runtime IS
  'DiNC runtime patient state (instances, statuses, responses, tasks). References dinc_metadata by stable code/UUID; never copies it.';

-- Identity and assignment principals.
CREATE SCHEMA IF NOT EXISTS dinc_security;
COMMENT ON SCHEMA dinc_security IS
  'DiNC security principals (users/care managers, roles, assignment). Referenced by dinc_runtime and dinc_audit.';

-- Append-only audit trail (INSERT-only privileges for the application role).
CREATE SCHEMA IF NOT EXISTS dinc_audit;
COMMENT ON SCHEMA dinc_audit IS
  'DiNC append-only audit trail. Tamper-evidence enforced by privileges: application may INSERT, never UPDATE/DELETE.';
