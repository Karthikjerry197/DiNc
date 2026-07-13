# DiNC PostgreSQL — Production Readiness Report

**Scope:** the nine SQL files in `postgresql_v1.8/` implementing the approved `DiNC_PostgreSQL_Database_Design.md` against the frozen `DiNC_Metadata_Master_v1.8.xlsx` (SHA-256 `c25641bb…`, recorded in `dinc_metadata.metadata_release`).
**Method:** static analysis with the real PostgreSQL parser (pglast / libpg_query), plus a live deployment to a **clean PostgreSQL 16.2 instance**, executed **twice**, followed by the full validation suite and an independent **cell-level roundtrip diff** of database contents against the workbook.
**Verdict: READY.** 0 errors. 2 warnings, both explained below, neither a defect in the SQL.

---

## 1. Passed checks

**Syntax & structure (static)**
- All 8 SQL files parse cleanly with the PostgreSQL parser: 1,113 statements total (06 alone: 1,020). `09_deploy.sql` is a psql orchestrator (meta-commands) — verified textually.
- Deployment order in 09 is correct dependency order: 01 → 02 → 04 → 03 → 05 → 06 → 07 → 08 (security before runtime because runtime FKs reference `app_user`; seed before validation because validation asserts seed completeness). `ON_ERROR_STOP` is set.
- No duplicate objects: 75 uniquely named tables/indexes/views/functions; 169 uniquely named constraints.
- All 43 FK references target tables created earlier in the deployment order. No table-level circular FK references (the event-level dependency graph inside `schedule_rule` data is separately verified acyclic by check `GRAPH/dependency cycles`).
- Seed order satisfies every metadata FK dependency (22 tables in dependency waves); 1,019 `ON CONFLICT DO NOTHING` clauses make the seed idempotent.

**Live deployment (clean database)**
- Run 1 on an empty PostgreSQL 16.2 cluster: **exit 0**, all objects created, seed loaded, views created, privileges granted, validation gate passed.
- Run 2 (identical command): **exit 0**, zero changes, zero duplicates — the deployment is proven safely rerunnable, not just claimed.
- Validation suite: **54 checks across 11 groups (FK, 1:1, PAIR, GRAPH, OVERRIDE, ENUM, SENTINEL, MAPPING, SEED, DUP, RUNTIME) — 0 violations.**
- **Workbook → database roundtrip diff: all 21 metadata tables are cell-identical to the frozen workbook** (1,017 rows compared value-by-value after type normalization; UUIDs verbatim; NULLs preserved as NULLs).
- Functional resolver checks: ANC 3 resolves to offset 45 (default) and 30 (HIGH_RISK); HRP resolves to interval 30, dependency EVT-001, terminator EVT-007; call-outcome resolution yields exactly 65×6 and 12×6 rows through the ALL-sentinel resolvers.
- Privilege boundary proven live: `dinc_app` is refused DML on `dinc_metadata.schedule_rule` and UPDATE on `dinc_audit.audit_log` (append-only audit enforced by grants).
- All CHECK constraints validated by fire: the seed loads through them, and the audited invariants (RECURRING⇒interval, SCHEDULE_DRIVEN⇒source, PREV⇒dependency, delay pairing, GLOBAL⇔ALL, override-has-delta) are now permanent database properties.
- All 15 `guidebook_discovery_rule` regex patterns compile (asserted at seed generation).

## 2. Warnings (explained, no action required)

**W1 — 19 event UUIDs do not recompute from the documented UUIDv5 recipe.**
Why it looks like an issue: the README documents `event_id = uuid5(ns, "event|<programme_name>|<event_name>")`, and recomputing this for EVT-012…EVT-030 (the 19 immunization session events) does not reproduce the stored IDs — their names were revised during workbook Iteration 2 (PRG-003 remodel) *after* ID assignment, and the IDs were deliberately kept stable.
Why it is not a defect here: the DDL-phase requirement is to use the workbook's deterministic UUIDs **verbatim**, and the audit confirms 0 missing/altered UUIDs in the seed (and the roundtrip diff proves the database carries exactly the workbook's keys). All 12 programme, 65 schedule_rule and 3 override keys do recompute perfectly. This is frozen-workbook provenance, out of scope for the SQL.
Optional future note: if regeneration-from-names is ever needed, record the historical name strings for these 19 events in a provenance column of a *future* workbook release — not a v1.8 change.

**W2 — 13 FK columns have no leading index** (e.g. `event_instance.event_id`, `outcome_response.field_id`, `notification.patient_id`, actor columns like `called_by`).
Why it is flagged: PostgreSQL does not auto-index FK referencing columns; reverse lookups and FK cascade checks on these columns would scan.
Why it is deliberate, not missing: the approved design (Task 5: "do not create unnecessary indexes"; Task 6 review) specifies constraint-backing indexes plus exactly the three product hot paths (worklist, follow-up queue, dispatcher) — all present. The flagged columns are per-enrolment navigation (already reached via indexed `enrolment_id`/`event_instance_id`) or low-frequency admin paths, on tables that start empty. Recommendation: add indexes only when a measured query needs one; adding them later is non-breaking.

## 3. Errors

**None.** Two genuine defects were found and fixed during the DDL phase itself, before this audit, and the shipped files already contain the fixes: (1) SQL-language helper functions required `SET check_function_bodies = off` in file 02 because their bodies reference tables created later in the same file (the standard pg_dump technique — discovered by the first live deploy, which is why live deployment is part of this pipeline); (2) a file-sync truncation in 02 was repaired and re-verified by parser and live deploy. This audit ran on the final files: clean.

## 4. Recommended improvements (non-blocking)

1. **Wrap files 01–05 + 07 in one migration tool step** (Flyway/Liquibase/sqitch) when CI/CD arrives; `09_deploy.sql` is the correct hand-run equivalent until then.
2. **Schedule re-resolution trigger**: the design requires due-date recomputation when `patient_condition` changes (README §10 step 6). This is engine/application logic by design — ensure the application layer (or a future trigger) implements it; the schema is ready (`event_instance.condition_context` records which variant priced each due date).
3. **Backups**: set different backup/retention policies per schema as the design intends (metadata is re-seedable from the workbook; runtime and audit are not).
4. Defer W2 indexes until measured; defer W1 provenance note to a future workbook release.

## 5. Faithfulness statement

**All checks pass. The SQL implementation faithfully matches the approved `DiNC_PostgreSQL_Database_Design.md` and the frozen `DiNC_Metadata_Master_v1.8.xlsx`:** every approved table, key, constraint, index, view, seed row and privilege boundary is present and behaves as specified on a live PostgreSQL 16.2 database; the seeded metadata is cell-identical to the workbook; the deployment is idempotent; and the validation gate enforces all of this on every future run.
