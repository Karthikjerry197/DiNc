# DiNC Backend Migration Analysis v1
Date: 2026-07-13
Scope: Migrate the existing NestJS backend (PGDATABASE=cphc) to the deployed DiNc database (dinc_metadata / dinc_runtime / dinc_security / dinc_audit). No redesign. Analysis only — no code changed.

Inputs: every repository and SQL-bearing service in `backend/src` was read; the live DiNc schema was dumped to `docs/dinc_schema_columns.txt` (22 metadata tables + 7 views, 9 runtime tables, 1 security table, 1 audit table).

---

## 1. Decisive structural finding

The backend references 49 tables, but they fall into two fundamentally different groups:

**Group A — Core tables (22): must be migrated to dinc_* schemas.**
citizens, enrollments, users, programs, sub_programs, diseases, events, worklist_items, outcome_types, outcome_templates, outcome_records, contact_outcomes, guidebooks, guidebook_mappings, guide_rules, faqs, training_modules, notifications, rules, retry_config, cphc_services, knowledge_assets.

**Group B — App-owned tables (27): the backend creates them itself on boot** (`CREATE TABLE IF NOT EXISTS` in onModuleInit). They have no counterpart in the frozen DiNc schema and need none — they will be auto-created in the DiNc database on first startup:
rbac_* (6), reference_categories/values (2), care_plan* (5), consultation_notes/responses + counselling_* (5), cdse_recommendation_decisions, clinical_alerts, dashboard_layouts, program_display_config, duplicate_requests (+history), overall_risk_matrix, guidebook_versions, scheduler_runs.

Consequence: **the real migration surface is only the Group A SQL**, plus re-pointing Group B foreign keys that reference Group A tables (`REFERENCES public.citizens/enrollments/users/programs/worklist_items/outcome_records/guidebooks` — 17 FK clauses in total across the DDL).

## 2. Conceptual model differences (not just renames)

| Old (cphc) | New (DiNc) | Impact |
|---|---|---|
| programs → sub_programs → diseases → events | programme → event → activity (no sub-programme, no disease level) | Cascade queries in enrollment/registration must collapse; disease context moves to `patient_condition.condition_code` + `event_instance.condition_context` |
| events.sequence, events.disease_id | event.display_order, event.programme_id | Rename + re-parent |
| worklist_items (status, priority, assigned_to, assigned_role, due_date, version, retry_count, is_escalation, outcome_recorded_at) | event_instance (status, due_date, occurrence_number, condition_context) + activity_instance + followup_task (priority, assigned_to, due_date) | Assignment/priority/optimistic-versioning columns do not exist on event_instance → Decision D5 |
| Hard-coded scheduling ("first event by sequence") | schedule_rule / schedule_rule_override via `v_schedule_rule_effective` | Registration and scheduler must instantiate events from metadata — this is the core of becoming metadata-driven |
| outcome_types (per-event outcomes) + rules + retry_config (editable engine config) | call_outcome + event_call_outcome + call_outcome_rule (frozen metadata, resolved views) | Workflow engine reads `v_call_outcome_rule_resolved` / `v_event_call_outcome_resolved`; admin edit screens for rules become read-only → Decision D3 |
| contact_outcomes, outcome_records | call_log, outcome_response | Rename + reshape (outcome_response keys on activity_instance_id + field_id) |
| citizens (uhid, age, gender, district, aadhaar, village, date_of_birth) | patient (external_id, birth_date, sex, address, phone, full_name) | uhid→external_id; age derived from birth_date; aadhaar/district/village missing → Decision D4 |
| users (password_hash, email, phone, department, designation, facility, last_login) | app_user (user_id, username, full_name, role, is_active, created_at) | **No credential column — login is impossible without Decision D1** |
| guidebooks (jsonb sections, versions, editable) | guidebook + guidebook_section + guidebook_mapping + guidebook_discovery_rule (frozen) | Reads remap cleanly (guide_rules ≈ guidebook_discovery_rule); writes conflict with frozen metadata → D3 |
| faqs / training_modules (editable, id PK) | faq / training_module (+ *_mapping, code PK, frozen) | Same: reads easy, writes → D3 |

## 3. Blocking decisions (need your answer before implementation)

**D1 — app_user has no password_hash.** Auth cannot work against DiNc as deployed. Options: (a) *recommended* — additive `ALTER TABLE dinc_security.app_user ADD COLUMN IF NOT EXISTS password_hash, email, phone, department, designation, facility, last_login, updated_at` using the codebase's existing additive-column convention (security schema is operational, not workbook-governed metadata); (b) separate `app_user_credential` table. Either preserves the frozen workbook.

**D2 — where do Group B app-owned tables live?** (a) *recommended* — keep them self-provisioning in `public` schema of the DiNc database (zero code churn beyond FK re-pointing); (b) move to a new `dinc_app` schema (cleaner, ~30 extra small edits). Metadata/runtime schemas stay untouched either way.

**D3 — admin write endpoints vs frozen metadata.** knowledge (FAQ/training editors), guidebooks (create/update), workflow (rule editing) write to what is now frozen metadata. Recommended: make these endpoints read-only in v1; changes flow through the workbook → metadata release process. Alternative: keep writes but only against app-owned overlay tables (bigger change; defer).

**D4 — patient fields missing on dinc_runtime.patient**: aadhaar, district, village, age (stored). Options: (a) *recommended* — additive nullable columns on patient (aadhaar, district, village); derive age from birth_date; map uhid→external_id and keep the ASSAM-YYYY-NNNNN generator; (b) drop these fields from registration UI. Duplicate detection needs aadhaar to keep working.

**D5 — worklist assignment/priority.** event_instance has no assigned_to/assigned_role/priority/version/retry_count. Options: (a) *recommended* — additive nullable columns (assigned_to uuid, priority text, version int) on event_instance, keeping current worklist UX intact while followup_task handles call-outcome follow-ups per the new design; (b) strict new-model adoption — worklist derives assignment purely from followup_task; larger frontend impact, defer to a later phase.

All four "additive" recommendations use `ADD COLUMN IF NOT EXISTS` on runtime/security tables only — the metadata workbook and dinc_metadata remain byte-for-byte frozen.

## 3a. DECISIONS TAKEN (2026-07-13) — supersede the options above

- **D1**: New table `dinc_security.user_credential` (credential_id, user_id FK → app_user, password_hash, password_algorithm, password_changed_at, failed_login_count, locked_until, last_login_at, is_active, created_at, updated_at). app_user stays identity/profile only.
- **D2**: New fifth schema **`dinc_app`**. All 27 backend-owned operational tables self-provision there (not public): rbac_*, care_plan_*, consultation_* + counselling_*, cdse_recommendation_decisions, clinical_alerts, dashboard_layouts, program_display_config, duplicate_requests(+history), overall_risk_matrix, guidebook_versions, reference_*, scheduler_runs, retry_config.
- **D3**: Metadata is READ-ONLY in v1. Admin endpoints/screens become viewers; display metadata release (v1.8). Changes flow: workbook → review → new release → deployment.
- **D4/D5**: Additive nullable columns only. `patient`: + aadhaar, district, village (age derived from birth_date; uhid→external_id). `event_instance`: + assigned_to, assigned_team (if required), priority, metadata_release_id (instead of a generic version counter). No PK/FK/relationship changes.

Documentation to keep in sync at each step: Database Design, ERD, README, Architecture Audit.

## 3b. STEP 0+1 — COMPLETED 2026-07-13

Implemented and verified:

- `scripts/dinc_step1_foundation.sql` applied to DiNc: schema `dinc_app`, table `dinc_security.user_credential`, additive columns on `patient` (aadhaar, district, village) and `event_instance` (assigned_to, assigned_team, priority, metadata_release_id).
- `backend/.env.dinc` added (PGDATABASE=DiNc). `.env` still points to cphc; to run against DiNc: set `PGDATABASE=DiNc` in the process environment (overrides .env) or copy .env.dinc over .env at cutover.
- `users.repository.ts` migrated to `dinc_security.app_user` + `user_credential`. Auth service unchanged (UserRecord shape preserved). Profile fields (email/phone/department/designation/facility) surface as NULL and are not persisted — TODO for a later step. `locked_until`/credential `is_active` are honoured at login.
- `rbac.repository.ts` migrated: all rbac_* tables in `dinc_app`, FKs → `app_user(user_id)`; primary-role mirror updates `app_user.role`.
- Mechanical pass: all 27 self-provisioned tables now create in `dinc_app.*`; core-table FK clauses inside that DDL replaced with `/* TODO(Step 2+) */` SQL comments; `public.uuid_generate_v4()` → `gen_random_uuid()`.
- Users seeded from cphc (bcrypt hashes preserved). Role mapping applied to satisfy `ck_app_user_role` (CARE_MANAGER|SUPERVISOR|ADMIN): CARE_ASSISTANT→CARE_MANAGER, CLINICIAN→SUPERVISOR. Note: rbac_roles seed keys may not match the new coarse roles — RBAC falls back to legacy role enforcement for unmapped users (revisit in Step 8/RBAC alignment).
- Verified against DiNc: clean boot (dinc_app: 27 tables, public: 0 tables), login OK (admin, clinician1), wrong password → 401, JWT guard enforced (401 unauthenticated), /api/users OK, /api/rbac/roles (4) and /api/rbac/permissions (5) OK, last_login_at recorded.

Expected boot warnings against DiNc (harmless until their step): registration citizens ALTER skipped, programme display config skipped (public.programs missing), workflow rules backfill/retry seed skipped. Business queries on core tables (citizens/enrollments/worklist_items/…) remain unmigrated by design — Steps 2–11.

## 3c. STEP 2 — COMPLETED 2026-07-13 (metadata reads, read-only)

Migrated all programme/event/activity metadata reads to `dinc_metadata`; registration, workflow, consultation and all runtime queries untouched.

- **enrollment.repository**: `findActivePrograms` → `programme` (ordered by display_order; description surfaces NULL — no such column); `isProgramActive`/`findProgramIdForDisease` → programme existence checks; `findEventsByDisease` → `event WHERE programme_id` ordered by display_order; `findDiseaseIdForEvent` → event's programme_id. New `findActivitiesByEvent` → `dinc_metadata.activity`.
- **Hierarchy shim**: the old 4-level cascade (program → sub_program → disease → event) collapses to programme → event → activity. `GET /programs/:id/sub-programs` and `GET /sub-programs/:id/diseases` mirror the programme itself (one row, id = programme_id), so the existing wizard/API contract keeps working and validation logic is unchanged. New endpoint `GET /events/:eventId/activities` exposes the third metadata level (EventActivityDto).
- **activity.repository**: `findEventsByDisease` / `findDiseaseIdForEvent` same remap (param = programme id via shim).
- **worklist.service**: programme filter list → `dinc_metadata.programme`.
- **program-metadata.repository**: colour-palette seed now ranks `dinc_metadata.programme` (write goes to `dinc_app.program_display_config` only).

Verified against DiNc: boot clean; `GET /api/programs` returns 12 programmes (= DB); events for PRG-001 = 8 (= DB); activities for its first event = 12 (= DB); shim endpoints return the programme mirror; `pg_stat_user_tables` write counter for dinc_metadata identical before/after the API exercise (1018 → 1018) — **zero writes to metadata**. tsc + nest build clean.

Still on legacy tables (later steps, by design): enrollment runtime joins (public.enrollments/worklist_items in findEnrollmentsByCitizen/findEnrollmentById/findEnrollmentContext), citizens/dashboard/analytics aggregates, registration, workflow, consultation, scheduler outcome lookups.

## 3d. STEP 3 — COMPLETED 2026-07-13 (patient & enrolment reads, read-only)

Migrated patient/enrolment reads in **citizens.service** and **enrollment.repository** to `dinc_runtime`. No writes implemented; registration/scheduling untouched.

Field mapping applied: uhid→external_id, gender→sex (FEMALE|MALE|OTHER), age→derived `date_part('year', age(birth_date))`, start_date→registration_date. "Current event" is derived (no current_event_id column): the earliest `event_instance` with `completed_at IS NULL` by due_date. Conditions come from `patient_condition` (uncleared rows) — they replace the old diseases arrays/labels. Fields with no DiNc counterpart surface as NULL and are never faked: assigned_worker/assignee, geographic_unit, enrolled_by, remarks, sub_program_*. Enrolment "priority" reads `event_instance.priority` (Step 0 additive column).

- citizens.service: list / citizen / programs / enrollment → patient + programme_enrolment + patient_condition (+ dinc_app.clinical_alerts keyed by patient_id going forward). activities/stats still read legacy worklist_items (Step 4) and degrade to empty.
- enrollment.repository: findEnrollmentsByCitizen, findEnrollmentById, findEnrollmentContext (haystack = programme name/code + current event + condition codes; disease_id mirrors programme_id per the Step 2 shim), citizenExists, hasActiveEnrollment (status='ACTIVE' per CHECK constraint ACTIVE|COMPLETED|EXITED). insertEnrollment/advanceCurrentEvent/setStatus remain legacy (Step 5+).
- `scripts/dinc_step3_dev_fixtures.sql`: idempotent DEV fixtures (3 patients, 3 enrolments, 2 event instances, 1 condition) for read verification; not for production.

Verified: boot clean; citizens list returns the 3 dinc_runtime patients with derived age (30 for 1996-04-12), sex mapping, programme/condition/status arrays; citizen detail derives current event "ANC 2"; enrolment list + detail return programme_enrolment rows; `pg_stat_user_tables` writes for dinc_runtime unchanged during API testing (9 → 9, all fixture inserts) and dinc_metadata unchanged (1018). tsc + build clean.

## 3e. STEP 4 — COMPLETED 2026-07-13 (worklist reads, read-only)

Worklist reads now derive from the runtime model: **event_instance → activity_instance → followup_task**. Files: worklist.service, activity.repository (reads), citizens.service (activities/stats panels). No runtime rows created; activity/registration writes untouched.

Derivations (documented in worklist.service header):

- Worklist item = event_instance, UNIONed with followup_task rows (surfaced as `FOLLOW_UP` items, activity "Follow-up call").
- Status: event_instance ACTIVE→PENDING, COMPLETED→COMPLETED, LOCKED→LOCKED; followup_task OPEN→PENDING, DONE→COMPLETED. Overdue = PENDING with due_date < today; dueToday = due_date = today.
- Current activity = first incomplete activity_instance (by metadata display_order), falling back to the event name. Item "type" now carries the enrolment's uncleared condition_code (old disease label).
- Escalation = priority 'URGENT' on a PENDING item (old is_escalation column is gone). Reminders/retry_count surface as 0 until Step 6.
- Assignment: event_instance.assigned_to / followup_task.assigned_to (app_user uuids, Step 0 additive column) resolve to usernames; monitoring counts pending per user across both sources; assignees list → app_user. findEnrollmentAssignee derives from the enrolment's latest assigned event_instance.
- getGuidebookForItem: item id = event_instance_id; context = enrolment programme (+shim disease) + event.
- `scripts/dinc_step4_dev_fixtures.sql`: dev fixtures — overdue assigned event_instance, COMPLETED+PENDING activity_instances, call_log 'CALLBACK' + OPEN HIGH followup_task.

Verified: boot clean; admin overview stats total=4 / pending=3 / overdue=1 / completed=1 (matches fixtures exactly); items include the derived current activity ("Abdominal examination…" after ANC-1 activity completed), the overdue item, and the FOLLOW_UP item; permission-scoped view for caremanager2 shows only their 2 items; monitoring pending counts correct (caremanager2:2); citizen activities/stats panels populated. Zero writes during API testing (dinc_runtime 14→14, dinc_metadata 1018→1018). tsc + build clean.

## 3f. STEP 5 — COMPLETED 2026-07-13 (registration write path — first metadata-driven writes)

registration.repository fully rewritten; registration.service target filter relaxed (enrolment proceeds even when a programme has no initially-active event); ResolvedProgramTarget.eventId now nullable; registration DTOs accept UUIDv5 (`@IsUUID('all')`) because DiNc metadata ids are deterministic v5 — **other modules' DTOs still validate v4 and need the same one-line fix when their write paths migrate (enrollment, activity, consultation, care-plan, data-quality, workflow)**.

The atomic write (one transaction): patient insert (external_id generator ASSAM-YYYY-NNNNN preserved; gender→sex FEMALE|MALE|OTHER, unknown→OTHER; birth_date = DOB, else derived `CURRENT_DATE - age years`, else NULL) → programme_enrolment (ACTIVE, registration_date=today) → **event_instance rows from metadata**: `v_schedule_rule_effective` rules that are ONE_TIME + PROGRAMME_REGISTRATION-anchored + no dependency_event_code + no existence_condition + default condition_context; due_date = today + offset_days; occurrence 1; ACTIVE; assigned_to = selected worker's user_id; metadata_release_id = latest release (v1.8) → activity_instance rows (PENDING, one per metadata activity). No recurring/BIRTH_DATE/dependent/future events — scheduler scope (Step 6). Reads migrated too: options (programme/app_user), duplicate check (external_id/phone/aadhaar on patient).

Verified end-to-end: POST /api/registration created patient ASSAM-2026-00004 (sex FEMALE, birth_date 1998-07-13 derived from age 28), ACTIVE enrolment, exactly one event_instance (EVT-001, due = registration + 90 days = 2026-10-11, release v1.8, assigned caremanager2) — dependent events EVT-002…008 correctly NOT created — and 12 PENDING activity_instances (= EVT-001's 12 metadata activities). The patient appeared immediately in the migrated worklist (current activity "Pregnancy registration…") and citizens list (derived age 28) with no worklist-specific code changes. dinc_metadata write counter unchanged (1018). Boot + tsc + build clean.

## 3g. STEP 6A — COMPLETED 2026-07-13 (activity lifecycle progression)

New endpoint `POST /api/activity-instances/:id/complete` (activity controller/service) backed by one transactional repository method `ActivityRepository.completeActivityInstance`:

1. activity_instance → COMPLETED (completed_at stamped per CHECK constraint).
2. Next incomplete activity of the event (metadata display_order) activates — LOCKED→PENDING; already-PENDING tolerated (Step-5 registration creates all-PENDING; 6A-created events use first-PENDING/rest-LOCKED).
3. No incomplete activity left → event_instance COMPLETED.
4-5. `v_schedule_rule_effective` read; dependent events activated when now satisfied: ONE_TIME + PREVIOUS_EVENT_COMPLETION + no existence_condition + default condition_context + not already instantiated on the enrolment. due = today + offset_days; assignee inherited from the completed event; metadata_release_id stamped.
6. Newly activated events get activity_instance rows: first PENDING, rest LOCKED.

Deliberately excluded (Step 6B+): RECURRING, BIRTH_DATE anchors, follow-up generation, schedule_rule_override / HIGH_RISK contexts, repeat_until_event.

Verified: (A) completing EVT-001's first activity advanced the worklist's current activity to activity #2, event stayed ACTIVE; (B) rollback — with a deliberately failing trigger on event_instance INSERT the API returned 500 and NOTHING changed (activity still PENDING, event still ACTIVE, no dependent instance) — single-transaction atomicity proven, trigger removed after; (C) completing ANC-2's last open activity auto-completed the event and activated EVT-003 (due = today+45 = 2026-08-27, release v1.8) with 4 activity instances (1 PENDING, 3 LOCKED), and the worklist immediately showed the new "Weight, BP & Hb monitoring" item. dinc_metadata untouched.

## 3h. STEP 6B — COMPLETED 2026-07-13 (metadata-driven scheduler engine)

scheduler.{service,repository,module,types} rewritten; the legacy WorkflowEngine dependency removed from the scheduler (workflow engine migration remains Step 8). Each cycle is ONE transactional sweep (DatabaseService.withTransaction — full rollback on any failure) reading only `dinc_metadata.v_schedule_rule_effective`:

1. **SEED** — occurrence 1 of every rule now satisfied for an ACTIVE enrolment. Context resolution: OVERRIDE row (condition_context, e.g. HIGH_RISK) wins over BASE when the enrolment has a matching uncleared patient_condition; chosen context stamped on event_instance.condition_context. Existence gates auto-evaluated: NULL, HIGH_RISK (uncleared flag), FEMALE_ONLY (patient.sex); IF_INITIATED/IF_INDICATED/ON_REFERRAL stay clinician-initiated (never auto-seeded). Anchors: PROGRAMME_REGISTRATION → registration_date, BIRTH_DATE → patient.birth_date (waits while NULL), PREVIOUS_EVENT_COMPLETION → latest completed_at of the dependency. due = anchor + offset_days.
2. **RECUR** — when a RECURRING event's latest occurrence is COMPLETED and the stream is neither exhausted (repeat_count) nor terminated (repeat_until_event_code completed), occurrence n+1 is created with due = anchor + offset + n·repeat_interval_days. Continuation applies to clinician-initiated streams too (once occurrence 1 exists).
3. **FOLLOW-UP** — each overdue ACTIVE event_instance without a prior system follow-up gets a system call_log (outcome NIL, called_by NULL, marker note) + followup_task; delay/priority from `v_call_outcome_rule_resolved` (programme × NIL → CREATE_FOLLOWUP), default 7d/HIGH; assignee inherited.

Duplicate prevention is structural (uq_ei_occurrence + NOT EXISTS + uq_ft_call_log); re-running a sweep is a no-op. Activity instances: first PENDING, rest LOCKED (6A convention). Run-log/DTO shape unchanged (counter mapping documented in scheduler.types.ts: activitiesCreated=seeded, retries=recurring, escalations=follow-ups, dueFound=overdue). 6A's dependent-event activation in activity.repository was made context-aware (required for override correctness — otherwise a BASE-context instance would permanently block the HIGH_RISK override): DISTINCT ON prefers the matching OVERRIDE, auto-evaluable existence gates honoured, condition_context stamped.

Verified against DiNc (backend on :4100, scheduler manual): PRG-003 newborn registration created 0 events (correct — no ONE_TIME/PROGRAMME_REGISTRATION rules); sweep #1 seeded EVT-012 (due = birth 2026-06-01), EVT-032/033 (due = registration 2026-07-13) and, for the HIGH_RISK enrolment, EVT-005/EVT-006 (existence HIGH_RISK, anchored on EVT-001's completion) — and raised 4 system follow-ups (NIL, due +7d, HIGH) for the overdue instances; sweep #2 created nothing (idempotent, even with the :4000 instance's AUTO cycles running concurrently); completing EVT-012 → sweep seeded EVT-013 due birth+42 = 2026-07-13 (BIRTH_DATE + dependency); completing EVT-003 → EVT-004 created with condition_context HIGH_RISK due today+30 = 2026-08-12 (override; BASE is +45); completing EVT-033 occ 1 → sweep created occ 2 due registration+180 = 2027-01-09 (RECURRING); failing BEFORE INSERT trigger → run recorded failures=1 and NOTHING persisted (rollback proven), trigger dropped, next sweep recreated all 3 events. dinc_metadata write counter 1018 → 1018 throughout. tsc + nest build clean. Note: the 6A completion response shows dueDate one day early (UTC slice of a local-midnight Date) — display-only, DB value correct; cosmetic, revisit with Step 7 API polish.

## 3i. STEP 7 — COMPLETED 2026-07-13 (Consultation & Outcome Engine)

consultation.{repository,service,module} rewritten onto dinc_runtime/dinc_metadata; the legacy WorkflowEngine dependency removed from the consultation module (Step 8 owns the workflow module itself). API contract unchanged (same endpoints/DTO shapes); `SaveConsultationDto.outcomeTypeId` now carries the metadata call-outcome CODE (property name kept for frontend compatibility, validator relaxed from UUIDv4).

- **Context** (`GET /activities/:id/consultation`): id = event_instance_id (the Step-4 worklist identity). One join over event_instance → programme_enrolment → patient → event/programme; "current activity" = first incomplete activity_instance by metadata display_order; its 1:1 `dinc_metadata.outcome_template` supplies the clinical form (`outcome_template_field` → ClinicalFieldDef: field_name→key, BOOLEAN→boolean, display_order→sortOrder); selectable outcomes come from `v_event_call_outcome_resolved` + `call_outcome` (id = code). Guidebook resolution degrades to null until Step 9 (legacy tables). Draft notes unchanged (dinc_app.consultation_notes keyed by event_instance_id).
- **Save** (`POST /activities/:id/consultation`) — one transaction (withTransaction, full rollback): `call_log` (outcome code, called_by resolved username→app_user uuid, notes) + one `outcome_response` per answered template field (activity_instance_id + field_id + response_value; multiple attempts allowed by design, latest-wins on read) + `followup_task` when the programme's `v_call_outcome_rule_resolved` rule is CREATE_FOLLOWUP (due = today + followup_delay_days, priority from the rule, assignee inherited; uq_ft_call_log). Supplementary (never roll back the clinical record): FINAL note and dinc_app.consultation_responses, both keyed by the call_log id (the consultation record identity — replaces outcome_record_id). CDSE classification unchanged (non-blocking). Lifecycle: an answered field whose metadata `workflow_action` = COMPLETE_ACTIVITY and value is truthy completes the current activity_instance via the EXISTING Step-6A path, then triggers one Step-6B scheduler sweep — no scheduling/lifecycle logic duplicated in the consultation module. `workflowAction` in the response = the rule's next_action; `escalated` = ESCALATION category or URGENT rule priority.
- **start-call** is now read-only (attemptNumber = call_log count + 1; call_log requires an outcome so nothing is recorded until save; event_instance has no IN_PROGRESS state).
- **Reads remapped**: timeline, consultation-history, clinical-journey, active-activity all derive from event_instance + call_log(+call_outcome) + outcome_response (latest per field, projected as {field_label: value}) + dinc_app notes; recorded_by resolves app_user usernames.

Verified against DiNc (:4100, scheduler manual; baby ASSAM-2026-00006, EVT-013 "Immunization Session — 6 weeks"): context returned the DTwP/DTaP-1 template's BOOLEAN field and the 6 metadata outcomes; CALLBACK save → call_log row (called_by admin) + followup_task due +3d NORMAL OPEN per the PRG-003 rule, workflowAction CREATE_FOLLOWUP; SUCCESS save with activity_completed=true → outcome_response rows for both attempts ('false' then 'true'), DTwP/DTaP-1 activity COMPLETED, Hib-1 LOCKED→PENDING (6A), scheduler sweep ran; draft note upsert/fetch OK; history/journey/timeline/active-activity all populated from the runtime model (system NIL follow-ups from 6B appear as consultations with recordedBy null). dinc_metadata write counter 1018 → 1018 throughout. tsc + nest build clean.

## 4. Per-repository analysis

Effort: S ≤ ½ day, M ≤ 1 day, L = 1–3 days, XL > 3 days. "Repoint FKs" = change `REFERENCES public.x` to the new table/PK in self-provisioned DDL.

| # | Module / file | Tables touched | What changes | Effort |
|---|---|---|---|---|
| 1 | database/DatabaseService | — | Nothing. Only `.env` PGDATABASE switch at cutover. | S |
| 2 | users.repository | users | All 11 queries → `dinc_security.app_user`; id→user_id; needs D1 columns; drop `ALTER users` onModuleInit in favour of D1 provisioning. | M |
| 3 | auth (service) | via users repo | No SQL of its own; retest only. | S |
| 4 | rbac.repository | rbac_* (self-prov), users | Keep app-owned; repoint 3 `REFERENCES public.users(id)` → `app_user(user_id)`; user lookup joins → app_user. | M |
| 5 | reference-data.repository | reference_* (self-prov) | No core refs at all. Works unchanged (subject to D2). | S |
| 6 | registration.repository | citizens, enrollments, worklist_items, programs, sub_programs, diseases, events, users | Largest conceptual rewrite: patient insert (D4 mapping), programme_enrolment insert (no disease_id/current_event_id/assigned_worker/enrolled_by — assignment via D5 column or followup), initial work item → create event_instance(s) from `v_schedule_rule_effective` (occurrence 1) + activity_instance rows per metadata activity. resolveTargets() collapses to programme→first event by display_order/schedule_rule. UHID generator → external_id. | L |
| 7 | enrollment.repository | enrollments, programs, sub_programs, diseases, events, citizens, worklist_items | 14 queries: programs→programme, enrolment column map (start_date→registration_date), drop sub_program/disease cascade endpoints (return programme→events directly), current_event derivation from event_instance, priority subquery → event_instance/followup_task. | L |
| 8 | activity.repository | worklist_items, events, enrollments, users | SELECT projection → event_instance JOIN event/activity_instance; insertActivity → event_instance+activity_instance insert; updateStatus/shiftDueDate/incrementRetry → event_instance (D5 columns for version/retry). | L |
| 9 | worklist.service | worklist_items, enrollments, citizens, programs, diseases, sub_programs, events, users | Read-only; same remap as #8 (list, counts, workload-by-user needs D5 assigned_to). | L |
| 10 | citizens.service | citizens, enrollments, programs, diseases, events, clinical_alerts, worklist_items | Read-heavy: patient list/detail remap (age→derived, gender→sex, uhid→external_id), diseases array → patient_condition codes, alerts stay app-owned (clinical_alerts), journey → event_instance. Insert → patient. | M–L |
| 11 | scheduler.repository | scheduler_runs (self-prov), worklist_items, enrollments, outcome_types | Keep run log. findDueActivities → event_instance overdue query. findNoResponseOutcome → call_outcome via event_call_outcome (`NO_RESPONSE`/category). | M |
| 12 | workflow.repository + service | rules, outcome_types, retry_config, events, notifications, programs, diseases, sub_programs | Engine reads → `v_call_outcome_rule_resolved` (next_action, followup_delay_days, priority); generated work → followup_task; notifications → dinc_runtime.notification (column map). retry_config has no counterpart → keep as app-owned self-provisioned table (it already seeds itself). Rule edit endpoints → read-only (D3). | XL |
| 13 | consultation.repository (1,783 lines) | counselling_* + consultation_* (self-prov), worklist_items, enrollments, citizens, events, programs, diseases, outcome_types, outcome_templates, outcome_records, contact_outcomes, guidebooks | Counselling/notes/responses stay app-owned (repoint 4 FKs to worklist→event_instance etc.). Recording path is the real work: outcome_templates→outcome_template(+field), outcome_types→event_call_outcome/call_outcome, contact_outcomes→call_log, outcome_records→outcome_response (keyed by activity_instance_id+field_id). History/timeline queries remapped like #9. | XL |
| 14 | cdse.repository | cdse tables + clinical_alerts (self-prov), citizens, enrollments, worklist_items, diseases, outcome_records | Keep app-owned; repoint FKs; ~8 core joins remapped (disease → patient_condition/programme). | M |
| 15 | care-plan.repository (1,020 lines) | care_plan* + decisions (self-prov), citizens, enrollments, programs, worklist_items, outcome_records | Almost entirely app-owned; ~6 core joins + 5 FK clauses to repoint. | M |
| 16 | knowledge.repository | faqs, training_modules, guidebooks | Reads → dinc_metadata.faq / training_module / guidebook(+section); id→code keys. Writes (INSERT/UPDATE faq etc.) removed or 405'd per D3. | M |
| 17 | guidebooks.service (671 lines) | guidebooks, guidebook_mappings, guide_rules, guidebook_versions (self-prov), counselling_* | Reads → guidebook + guidebook_section + guidebook_mapping + guidebook_discovery_rule (replaces guide_rules text rules). jsonb-sections handling → section table rows. Create/update/versions → read-only (D3); guidebook_versions table retired or kept dormant. | L |
| 18 | dashboard: program-metadata.repository | programs, program_display_config (self-prov) | programs→programme rename (3 queries); display config unchanged. | S |
| 19 | dashboard: dashboard-layout.repository | dashboard_layouts (self-prov) | Unchanged. | S |
| 20 | dashboard.service | citizens, enrollments, worklist_items, events, programs, sub_programs, clinical_alerts, notifications, outcome_records, cphc_services, knowledge_assets | Aggregate tiles remapped; cphc_services/knowledge_assets have no counterpart → verify usage (likely static/optional) and stub or keep app-owned. | M–L |
| 21 | analytics.repository (819 lines, 67 FROM/JOINs) | citizens, enrollments, worklist_items, programs, users, guidebooks, faqs, training_modules, outcome_*, rules, scheduler_runs, clinical_alerts, duplicate_requests, diseases | Mechanical but voluminous remap of aggregates; disease-level breakdowns become condition_code breakdowns. Do last — read-only, nothing depends on it. | L |
| 22 | overall-risk.repository | overall_risk_matrix (self-prov) | Unchanged. | S |
| 23 | data-quality.repository | duplicate_requests(+history) (self-prov), citizens, clinical_alerts | Keep app-owned; repoint 1 FK + citizen joins → patient. | M |
| 24 | system.service | none (env/config only) | Retest only. | S |

## 5. Recommended migration order

Ordering principle: make the app boot and authenticate against DiNc first, then migrate reads before writes, core before periphery. Each step ends with: backend boots clean against DiNc, smoke test of the migrated module, nothing else regresses (old modules may still fail until their step — acceptable on the migration branch).

- **Step 0 — Branch + dual-env.** Git branch `migrate/dinc`; add `.env.dinc` (PGDATABASE=DiNc); no code changes. Apply D1/D4/D5 additive columns via one idempotent provisioning script (or onModuleInit, matching existing convention).
- **Step 1 — Identity: users + auth + rbac** (repos #2, #3, #4). Smallest coherent slice that lets anyone log in. Includes FK repointing across all Group B DDL so every module's onModuleInit succeeds against DiNc (one mechanical pass).
- **Step 2 — Metadata reads: programme/event/activity** (#18, and the programme/event lookups inside #6/#7). Establishes the dinc_metadata read patterns every later step reuses.
- **Step 3 — Patient & enrolment reads: citizens.service, enrollment.repository** (#10, #7).
- **Step 4 — Worklist reads: worklist.service, activity reads** (#9, #8-reads).
- **Step 5 — Registration write path** (#6): patient + programme_enrolment + metadata-driven event_instance/activity_instance creation from `v_schedule_rule_effective`. First truly metadata-driven behaviour.
- **Step 6 — Activity lifecycle writes + scheduler** (#8-writes, #11).
- **Step 7 — Consultation recording** (#13): call_log + outcome_response + outcome_template rendering.
- **Step 8 — Workflow engine on metadata rules** (#12): v_call_outcome_rule_resolved → followup_task + notification.
- **Step 9 — Knowledge & guidebooks reads** (#16, #17), admin writes read-only per D3.
- **Step 10 — Periphery: cdse, care-plan, data-quality core-join remaps** (#14, #15, #23).
- **Step 11 — Dashboards & analytics** (#20, #21). Cutover: flip `.env`, retire cphc.

Total estimate: roughly 15–22 working days of focused effort, front-loaded on Steps 5–8.

## 6. Old→new table mapping (consolidated)

| Old | New |
|---|---|
| citizens | dinc_runtime.patient |
| enrollments | dinc_runtime.programme_enrolment |
| users | dinc_security.app_user |
| programs | dinc_metadata.programme |
| sub_programs, diseases | — (collapsed; condition via patient_condition / condition_context) |
| events | dinc_metadata.event |
| worklist_items | dinc_runtime.event_instance + activity_instance (+ followup_task) |
| outcome_types | dinc_metadata.call_outcome + event_call_outcome |
| outcome_templates | dinc_metadata.outcome_template + outcome_template_field |
| outcome_records | dinc_runtime.outcome_response |
| contact_outcomes | dinc_runtime.call_log |
| rules, (retry_config partially) | dinc_metadata.call_outcome_rule (+ v_call_outcome_rule_resolved) |
| notifications | dinc_runtime.notification |
| guidebooks (+jsonb sections) | dinc_metadata.guidebook + guidebook_section |
| guidebook_mappings | dinc_metadata.guidebook_mapping |
| guide_rules | dinc_metadata.guidebook_discovery_rule |
| faqs | dinc_metadata.faq + faq_mapping |
| training_modules | dinc_metadata.training_module + training_module_mapping |
| — (new capability) | schedule_rule, schedule_rule_override, v_schedule_rule_effective, nutrition_advice*, enum_reference, metadata_release, dinc_audit.audit_log |
| 27 self-provisioned app tables | unchanged (FK repoint only), per D2 |
| cphc_services, knowledge_assets | no counterpart — verify usage in dashboard.service, stub or self-provision |
