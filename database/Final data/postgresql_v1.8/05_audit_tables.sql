-- ============================================================================
-- DiNC Platform — PostgreSQL Implementation
-- File 05: Audit tables (dinc_audit)
-- Approved design : DiNC_PostgreSQL_Database_Design.md (Task 2 R10, Task 4)
-- Idempotent      : yes
--
-- Append-only ledger. Soft entity references BY DESIGN: the audit trail must
-- survive evolution of business tables, so no FKs into them. Tamper-evidence
-- is enforced by privilege (application role: INSERT only — see 09_deploy.sql
-- privileges section).
-- ============================================================================

CREATE TABLE IF NOT EXISTS dinc_audit.audit_log (
    audit_id     bigint      GENERATED ALWAYS AS IDENTITY,
    entity_table text        NOT NULL,             -- schema-qualified table name (soft reference)
    entity_id    text        NOT NULL,             -- PK of the affected row, as text (soft reference)
    action       text        NOT NULL,
    actor        uuid,                             -- app_user.user_id; soft (audit outlives principal churn)
    old_data     jsonb,
    new_data     jsonb,
    occurred_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_audit_log  PRIMARY KEY (audit_id),
    CONSTRAINT ck_audit_verb CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'LOGIN', 'SEED'))
);
COMMENT ON TABLE dinc_audit.audit_log IS
  'Append-only. Application role has INSERT only; UPDATE/DELETE revoked — tamper-evidence by privilege. bigint identity: monotonic key aids archival of a high-volume ledger.';

-- Audit indexes (approved: entity timeline and actor timeline)
CREATE INDEX IF NOT EXISTS ix_audit_entity_time ON dinc_audit.audit_log (entity_table, entity_id, occurred_at);
CREATE INDEX IF NOT EXISTS ix_audit_actor_time  ON dinc_audit.audit_log (actor, occurred_at);
