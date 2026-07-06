# Milestone 28 — Workflow Engine & Clinical Automation **Implementation Contract**

**Status:** APPROVED — FROZEN (2026-07-02, F0 review complete). Changes
require a contract amendment approved before code (H10).

This document is **binding**. Developers (human or AI) implement exactly what
is written here, in the order of Part F, one small commit at a time, each
commit building green and stopping for approval — the same discipline as
Milestone 27. Where the architecture document and this contract disagree,
this contract wins.

---

## Part A — Binding Rules (non-negotiable)

- **A1. Backend only.** No file under `frontend/` changes in M28, except the
  explicitly optional items marked *(frontend-optional)* in Part E — and those
  only with separate approval. The M27 Worklist freeze stands.
- **A2. Additive schema only.** New tables/columns only; no DROP, no type
  changes, no renames of existing objects. Every DDL statement is idempotent
  (`IF NOT EXISTS` / guarded `ALTER`), lives in the owning repository's
  `onModuleInit`, and is mirrored verbatim in
  `scripts/milestone28_workflow_engine.sql`.
- **A3. No new runtime infrastructure.** PostgreSQL and the existing Node
  process only. No broker, no Redis, no new services. New npm dependencies:
  **none** (the dispatcher is a plain interval loop like the existing
  scheduler; `@nestjs/event-emitter` is NOT used — subscriptions go through
  the explicit registry in `events/`, so delivery stays observable and
  testable).
- **A4. Feature flags, default off.** `EVENTS_ENABLED`, `TASK_ENGINE_ENABLED`,
  `CLINICAL_RULES_ENABLED`, `WORKFLOW_RUNTIME_ENABLED`, `JOB_QUEUE_ENABLED`,
  `EVENT_NOTIFICATIONS_ENABLED` — read once at module init via
  `ConfigService`, logged at startup. A disabled module registers nothing and
  costs nothing. Rollback of any phase = flip the flag.
- **A5. Repository discipline.** Only the owning module's repository issues
  SQL against its tables (Part C ownership map). All multi-write operations
  use `DatabaseService.withTransaction`; event publication happens **inside**
  the producer's transaction via the `TxClient` overload. Consumers write
  the `event_consumptions` ledger only through the helper exported by
  `events/` (its owning module), called inside the consumer's transaction —
  they never issue SQL against it directly.
- **A6. Immutability is enforced in the database**, not by convention:
  `domain_events`, `workflow_transitions`, and `task_transitions` carry an
  **unconditional** trigger that raises an exception on any UPDATE or DELETE,
  and PUBLISHED **and RETIRED** `workflow_definitions` reject content
  mutation and deletion via trigger
  (Part B, `B7`). `domain_events` is strictly INSERT-only — delivery state
  lives in `consumer_offsets`/`event_consumptions`, never on the log.
- **A7. Idempotent consumers.** Every event consumer records
  `(consumer, event_id)` in `event_consumptions` inside the same transaction
  as its effects, via the events-module ledger helper — an upsert
  (`INSERT ... ON CONFLICT (consumer, event_id) DO UPDATE`): if the existing
  row has `status='OK'` the event is already processed — skip effects,
  return success; if it has `status='FAILED'` (a prior failed attempt, or
  the F11 redrive marker) the successful retry flips it to `OK` in the same
  transaction as the effects. A key conflict alone never means success —
  only an existing `OK` row does.
- **A8. Loop guard.** `causation_depth` max = **5**. `EventBus.publish`
  rejects deeper events with a logged error event (`system.loop_suppressed`),
  never an exception to the caller.
- **A9. No behaviour change while a flag is off.** Every commit in Part F
  must leave `npm run build` green in `backend/` AND the existing consultation
  → workflow → scheduler flow byte-identical in its API responses when all
  M28 flags are off.
- **A10. Naming.** Tables `snake_case` in `public`; events
  `aggregate.verb_past_tense` (documented exception: `reminder.due`);
  flags `SCREAMING_SNAKE`; modules/services
  follow existing NestJS layout (`module/x.module.ts`, `x.service.ts`,
  `x.repository.ts`, `x.controller.ts`, `x.types.ts`).
- **A11. Commit protocol.** One Part F phase-step per commit; the user
  approves content, then explicitly says "create the commit".
  `.claude/settings.local.json` is never committed.
- **A12. Payload PII rule (mandatory).** Event payloads contain identifiers
  only — uuids, UHIDs, codes, enum values, timestamps, counts. Never patient
  names, never free-text clinical notes, never contact details. The catalog
  defines each event type's **allowed** payload keys; `EventBus.publish`
  rejects any payload containing keys outside that set.

---

## Part B — Database Schema (exact DDL)

All statements idempotent; all also shipped in
`scripts/milestone28_workflow_engine.sql` in this order.

### B1. `domain_events` — the outbox + immutable audit log

```sql
CREATE TABLE IF NOT EXISTS public.domain_events (
  id               uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
  seq              bigserial NOT NULL,               -- global dispatch order
  event_type       varchar(80)  NOT NULL,
  schema_version   integer      DEFAULT 1 NOT NULL,
  occurred_at      timestamptz  DEFAULT now() NOT NULL,
  actor_type       varchar(10)  NOT NULL,            -- USER | SYSTEM | RULE
  actor_id         varchar(80),                      -- users.id / component / rule id
  subject_type     varchar(20),                      -- CITIZEN (nullable for system events)
  subject_id       uuid,
  entity_type      varchar(30)  NOT NULL,            -- WORKLIST_ITEM | TASK | ENROLLMENT | ...
  entity_id        uuid,
  correlation_id   uuid         NOT NULL,
  causation_id     uuid,                             -- parent event id
  causation_depth  integer      DEFAULT 0 NOT NULL,
  payload          jsonb        DEFAULT '{}'::jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_domain_events_seq
  ON public.domain_events (seq);
CREATE INDEX IF NOT EXISTS idx_domain_events_subject
  ON public.domain_events (subject_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_entity
  ON public.domain_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_type
  ON public.domain_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_correlation
  ON public.domain_events (correlation_id);
```

*Note:* the table is strictly **INSERT-only** (B7 trigger, unconditional).
It carries **no delivery state** — dispatch progress lives in
`consumer_offsets` (B2). *Soft-reference rule:* no other table declares a
foreign key **into** `domain_events`; references to event ids are plain
uuids documented as `soft ref`, keeping future partitioning/archival of the
log unconstrained.

### B2. `consumer_offsets` + `event_consumptions` — delivery bookkeeping

```sql
CREATE TABLE IF NOT EXISTS public.consumer_offsets (
  consumer    varchar(60) NOT NULL PRIMARY KEY,
  last_seq    bigint      DEFAULT 0 NOT NULL,   -- highest seq fully handled
  updated_at  timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.event_consumptions (
  consumer     varchar(60) NOT NULL,
  event_id     uuid        NOT NULL,   -- soft ref → domain_events.id (no FK)
  consumed_at  timestamptz DEFAULT now() NOT NULL,
  status       varchar(10) DEFAULT 'OK' NOT NULL,   -- OK | FAILED | DEAD
  attempts     integer     DEFAULT 1 NOT NULL,
  error        text,
  PRIMARY KEY (consumer, event_id)
);
```

`consumer_offsets` is the dispatcher's cursor per consumer;
`event_consumptions` is the idempotency ledger + failure record, written
per the A7 upsert protocol: `OK` = processed (effects committed); `FAILED`
= a prior attempt failed (or the F11 redrive marker) and the event remains
eligible for retry, which flips the row to `OK` on success. `OK` rows
at or below a consumer's `last_seq` are prunable housekeeping (pruning
itself is deferred; documented so nobody treats the ledger as audit).

### B3. `tasks` + `task_transitions` — the centralized task engine

```sql
CREATE TABLE IF NOT EXISTS public.tasks (
  id               uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
  task_type        varchar(40)  NOT NULL,            -- FOLLOW_UP_CALL | REVIEW_ALERT | ...
  title            varchar(200) NOT NULL,
  description      text,
  status           varchar(15)  DEFAULT 'OPEN' NOT NULL,
                   -- OPEN | IN_PROGRESS | COMPLETED | CANCELLED | EXPIRED
  priority         varchar(10)  DEFAULT 'NORMAL' NOT NULL, -- LOW|NORMAL|HIGH|URGENT
  citizen_id       uuid REFERENCES public.citizens(id),
  worklist_item_id uuid REFERENCES public.worklist_items(id),
  alert_id         uuid,                              -- clinical_alerts.id (soft ref)
  assigned_role    varchar(30),                       -- role-based queue
  assigned_user_id uuid,                              -- users.id (soft ref)
  due_at           timestamptz,
  sla_minutes      integer,
  escalation_level integer      DEFAULT 0 NOT NULL,
  source           varchar(10)  DEFAULT 'SYSTEM' NOT NULL, -- RULE|WORKFLOW|SYSTEM|MANUAL
  source_ref       varchar(80),                       -- rule id / instance id / user id
  dedupe_key       varchar(160),
  source_event_id  uuid,                              -- soft ref → domain_events.id (no FK)
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL,
  completed_at     timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_dedupe
  ON public.tasks (dedupe_key) WHERE dedupe_key IS NOT NULL
                                 AND status IN ('OPEN','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_tasks_queue
  ON public.tasks (status, priority, due_at)
  WHERE status IN ('OPEN','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_tasks_citizen ON public.tasks (citizen_id);

CREATE TABLE IF NOT EXISTS public.task_transitions (
  id           uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
  task_id      uuid NOT NULL REFERENCES public.tasks(id),
  from_status  varchar(15),
  to_status    varchar(15) NOT NULL,
  actor_type   varchar(10) NOT NULL,
  actor_id     varchar(80),
  note         text,
  occurred_at  timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_transitions_task
  ON public.task_transitions (task_id, occurred_at);
```

Task state machine (enforced in `TaskService`, the only writer):
`OPEN → IN_PROGRESS → COMPLETED`; `OPEN|IN_PROGRESS → CANCELLED`;
`OPEN → EXPIRED` (scheduler only). Terminal states are final.

### B4. `clinical_rules` — configurable clinical automation

```sql
CREATE TABLE IF NOT EXISTS public.clinical_rules (
  id              uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
  code            varchar(60)  NOT NULL UNIQUE,      -- stable handle, e.g. CR_SEVERE_ALERT_TASK
  name            varchar(160) NOT NULL,
  description     text,
  trigger_event   varchar(80)  NOT NULL,             -- catalog event type
  condition       jsonb        DEFAULT '{}'::jsonb NOT NULL,  -- predicate DSL (B4.1)
  actions         jsonb        DEFAULT '[]'::jsonb NOT NULL,  -- action list (B4.2)
  is_active       boolean      DEFAULT false NOT NULL,        -- ships OFF (Risk R1)
  dry_run         boolean      DEFAULT true  NOT NULL,        -- simulate until proven
  daily_budget    integer      DEFAULT 200 NOT NULL,          -- max firings/day
  version         integer      DEFAULT 1 NOT NULL,
  updated_by      varchar(80),
  created_at      timestamptz  DEFAULT now() NOT NULL,
  updated_at      timestamptz  DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clinical_rules_trigger
  ON public.clinical_rules (trigger_event) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.clinical_rule_versions (
  id          uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
  rule_id     uuid NOT NULL REFERENCES public.clinical_rules(id),
  version     integer NOT NULL,
  snapshot    jsonb   NOT NULL,        -- full rule row at save time
  changed_by  varchar(80),
  changed_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (rule_id, version)
);
```

**B4.1 Predicate DSL** (evaluated by `RuleEvaluator`; closed vocabulary, no
`eval`): a jsonb tree of
`{ "all": [...] } | { "any": [...] } | { "not": {...} } |
{ "field": "<path>", "op": "<op>", "value": <json> }` where `path` addresses
the event payload (`payload.riskLevel`) or enriched subject context
(`subject.activeEnrollmentCount`, `entity.priority`) from a **fixed, documented
context builder** — ops: `eq, neq, gt, gte, lt, lte, in, contains, exists`.
Unknown field paths or ops fail validation at save time, never at runtime.

**B4.2 Action list**: array of
`{ "type": "<WorkflowAction | CREATE_TASK | SCHEDULE_TIMER | RAISE_ALERT>",
"params": { ... } }`. Params are validated per action type at save time.

### B5. `workflow_definitions` / `workflow_instances` / `workflow_transitions`

```sql
CREATE TABLE IF NOT EXISTS public.workflow_definitions (
  id            uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
  code          varchar(60) NOT NULL,
  version       integer     NOT NULL,
  name          varchar(160) NOT NULL,
  subject_type  varchar(20) NOT NULL,            -- ENROLLMENT | TASK | CITIZEN
  status        varchar(10) DEFAULT 'DRAFT' NOT NULL, -- DRAFT | PUBLISHED | RETIRED
  graph         jsonb       NOT NULL,            -- { states:[], transitions:[] } (B5.1)
  migrated_from_rule_id uuid,                    -- legacy rules mapping provenance
  published_at  timestamptz,
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL,
  UNIQUE (code, version)
);

CREATE TABLE IF NOT EXISTS public.workflow_instances (
  id             uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
  definition_id  uuid NOT NULL REFERENCES public.workflow_definitions(id),
  subject_type   varchar(20) NOT NULL,
  subject_id     uuid        NOT NULL,
  current_state  varchar(60) NOT NULL,
  status         varchar(10) DEFAULT 'RUNNING' NOT NULL,
                 -- RUNNING | COMPLETED | CANCELLED | FAILED
  context        jsonb       DEFAULT '{}'::jsonb NOT NULL,
  last_error     text,                            -- set when status = FAILED
  correlation_id uuid        NOT NULL,
  started_at     timestamptz DEFAULT now() NOT NULL,
  ended_at       timestamptz,
  updated_at     timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_subject
  ON public.workflow_instances (subject_type, subject_id)
  WHERE status = 'RUNNING';

CREATE TABLE IF NOT EXISTS public.workflow_transitions (
  id            uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
  instance_id   uuid NOT NULL REFERENCES public.workflow_instances(id),
  from_state    varchar(60),
  to_state      varchar(60) NOT NULL,
  trigger_type  varchar(10) NOT NULL,           -- EVENT | TIMER | MANUAL
  trigger_ref   varchar(120),                   -- event id / job id / user id
  guard_context jsonb,                          -- resolved guard inputs at evaluation
                                                -- time (reproducibility — A6/G13)
  actions_run   jsonb DEFAULT '[]'::jsonb NOT NULL,
  occurred_at   timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_instance
  ON public.workflow_transitions (instance_id, occurred_at);
```

**B5.1 Graph shape** (validated on publish): `states:
[{ name, type: 'normal'|'wait'|'terminal', initial?: true }]`;
`transitions: [{ from, to,
trigger: { kind: 'event'|'timer'|'manual', eventType?, afterMinutes?,
action? }, guard?: <B4.1 predicate>, actions: <B4.2 list> }]`. Publish-time
validation: exactly one state carries `initial: true` (and it is not
`terminal`), all transition endpoints exist, at least one terminal state
reachable, event types in catalog. Published (and retired) graphs
are immutable — **database-enforced** by the B7 definition trigger; edits
create version+1 as DRAFT.

### B6. `scheduled_jobs` — durable timers

```sql
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id            uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
  kind          varchar(40)  NOT NULL,   -- REMINDER | ESCALATION | TASK_EXPIRY |
                                         -- WORKFLOW_TIMER | OVERDUE_SWEEP
  run_at        timestamptz  NOT NULL,
  payload       jsonb        DEFAULT '{}'::jsonb NOT NULL,
  status        varchar(10)  DEFAULT 'PENDING' NOT NULL,
                -- PENDING | RUNNING | DONE | FAILED | CANCELLED
  attempts      integer      DEFAULT 0 NOT NULL,
  max_attempts  integer      DEFAULT 3 NOT NULL,
  locked_by     varchar(60),
  locked_at     timestamptz,
  dedupe_key    varchar(160),
  source_event_id uuid,                    -- soft ref → domain_events.id (no FK)
  last_error    text,
  created_at    timestamptz  DEFAULT now() NOT NULL,
  completed_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_jobs_dedupe
  ON public.scheduled_jobs (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_due
  ON public.scheduled_jobs (run_at) WHERE status = 'PENDING';
```

**Execution protocol (binding):**

1. **Claim:** `UPDATE ... SET status='RUNNING', locked_by=$1, locked_at=now(),
   attempts=attempts+1 WHERE id IN (SELECT id FROM scheduled_jobs WHERE
   status='PENDING' AND run_at <= now() ORDER BY run_at LIMIT $2
   FOR UPDATE SKIP LOCKED) RETURNING *`.
2. **Exactly-once within the database:** the handler's effects AND
   `status='DONE', completed_at=now()` commit in **one transaction**
   (`withTransaction`). A crash between claim and commit leaves no partial
   effects — only a stale `RUNNING` row.
3. **Failure & backoff:** a handler error rolls back the effects, then (in a
   new transaction) sets `status='PENDING'`,
   `run_at = now() + LEAST(2^attempts, 60) * interval '1 minute'`
   (exponential backoff, capped at 60 min) and records `last_error` — unless
   `attempts >= max_attempts`, in which case `status='FAILED'` (terminal;
   surfaced on the status endpoint, redriven only manually).
4. **Orphan (stale-lease) reclaim:** the sweep returns `RUNNING` rows with
   `locked_at` older than 10 min to `PENDING` (backoff as in step 3), or to
   `FAILED` when the attempt cap is reached. Reclaim after a
   crash-after-commit is impossible by construction (step 2 sets DONE
   atomically with the effects).
5. **Duplicates:** `dedupe_key` uniqueness applies to `PENDING` rows; a job
   that fires twice through redelivery of its *triggering event* is blocked
   by the consumer idempotency ledger (A7), not by the queue.

### B7. Immutability triggers

Unconditional — no column carve-outs exist anywhere in the immutable set:

```sql
CREATE OR REPLACE FUNCTION public.dinc_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'DiNC: % rows are immutable (%)', TG_TABLE_NAME, TG_OP;
END $$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_domain_events_immutable') THEN
    CREATE TRIGGER trg_domain_events_immutable
      BEFORE UPDATE OR DELETE ON public.domain_events
      FOR EACH ROW EXECUTE FUNCTION public.dinc_forbid_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_workflow_transitions_immutable') THEN
    CREATE TRIGGER trg_workflow_transitions_immutable
      BEFORE UPDATE OR DELETE ON public.workflow_transitions
      FOR EACH ROW EXECUTE FUNCTION public.dinc_forbid_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_task_transitions_immutable') THEN
    CREATE TRIGGER trg_task_transitions_immutable
      BEFORE UPDATE OR DELETE ON public.task_transitions
      FOR EACH ROW EXECUTE FUNCTION public.dinc_forbid_mutation();
  END IF;
END $$;
```

Published **and retired** workflow definitions: content is frozen for both
(retirement never unfreezes — pinned history must stay reproducible). For a
PUBLISHED row, only the `PUBLISHED → RETIRED` status move (and `updated_at`)
is allowed; for a RETIRED row, only `updated_at`. Neither can be deleted:

```sql
CREATE OR REPLACE FUNCTION public.dinc_guard_published_definition() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('PUBLISHED','RETIRED') THEN
      RAISE EXCEPTION 'DiNC: published/retired workflow definitions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('PUBLISHED','RETIRED') AND (
       NEW.graph        IS DISTINCT FROM OLD.graph OR
       NEW.code         IS DISTINCT FROM OLD.code OR
       NEW.version      IS DISTINCT FROM OLD.version OR
       NEW.subject_type IS DISTINCT FROM OLD.subject_type OR
       NEW.name         IS DISTINCT FROM OLD.name OR
       NEW.published_at IS DISTINCT FROM OLD.published_at OR
       NEW.migrated_from_rule_id IS DISTINCT FROM OLD.migrated_from_rule_id OR
       (OLD.status = 'PUBLISHED' AND NEW.status NOT IN ('PUBLISHED','RETIRED')) OR
       (OLD.status = 'RETIRED'  AND NEW.status <> 'RETIRED'))
  THEN
    RAISE EXCEPTION 'DiNC: published/retired workflow definitions are immutable';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_workflow_definitions_guard') THEN
    CREATE TRIGGER trg_workflow_definitions_guard
      BEFORE UPDATE OR DELETE ON public.workflow_definitions
      FOR EACH ROW EXECUTE FUNCTION public.dinc_guard_published_definition();
  END IF;
END $$;
```

### B8. `notifications` — additive columns

```sql
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title varchar(160);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS severity varchar(10) DEFAULT 'INFO';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedupe_key varchar(160);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS source_event_id uuid;
  -- soft ref → domain_events.id (no FK; B1 soft-reference rule)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe
  ON public.notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status = 'PENDING';
```

---

## Part C — Module & Service Contracts

Ownership map (A5): `events/` → B1, B2 · `tasks/` → B3 · `rules/` → B4 ·
`workflow/` → B5 (+ existing `rules`, `retry_config`) · `scheduler/` → B6
(+ existing `scheduler_runs`) · `notifications/` → `notifications`.

### C.1 `events/` — EventBus + Dispatcher

- `EventBus.publish(tx: TxClient, input: PublishInput): Promise<string>` —
  the ONLY way an event is written. Requires the caller's transaction client;
  fills envelope defaults; validates `event_type` against the catalog;
  enforces A8. Returns the event id.
  `PublishInput = { eventType, actorType, actorId?, subjectType?, subjectId?,
  entityType, entityId?, correlationId?, causationId?, payload }` — when
  `causationId` is given, correlation and depth are derived from the parent.
- `EventCatalog` (`events/event-catalog.ts`): a const map
  `event_type → { schemaVersion, requiredPayloadKeys[], allowedPayloadKeys[] }`
  for every type in architecture §4.2. Publishing an unknown type, missing a
  required key, or including a key outside `allowedPayloadKeys` throws at
  publish (A12); registering a consumer for an unknown type throws at
  startup.
- `EventDispatcher` — **strict-order singleton**. Interval loop
  (`EVENTS_DISPATCH_INTERVAL_MS`, default 2000). Each tick first takes the
  singleton advisory lock (`pg_try_advisory_lock(28001)`); if unavailable
  the tick is a no-op (passive standby — guards against a second Node
  process). Per registered consumer: read events
  `WHERE seq > consumer_offsets.last_seq ORDER BY seq LIMIT
  EVENTS_DISPATCH_BATCH` (default 100), skip types the consumer is not
  subscribed to, deliver **one at a time in `seq` order** honouring A7, and
  advance `last_seq` after each handled event. On failure: record
  `FAILED`/attempts++ in `event_consumptions` and stop that consumer's lane
  for this tick (retried next tick, backoff = tick interval); after 5
  attempts mark `DEAD`, log, and advance past it (documented per-consumer
  gap — architecture §4.3). No per-subject or per-consumer parallelism in
  M28; horizontal parallelism is intentionally deferred (H1) and requires
  no schema change.
- `ConsumerRegistry.register(consumer: { name, eventTypes[], handle(event) })`
  — called from module init of consuming modules; static, no runtime
  (un)subscription.
- **Redrive pass:** each tick, before the cursor pass, the dispatcher
  delivers any event whose consumption row for a consumer is `FAILED` with
  `attempts = 0` — the marker written by the F11 redrive CLI when an
  operator resets a `DEAD` letter (`consumer + event_id → FAILED,
  attempts=0`). This is the ONLY path by which an event below a consumer's
  cursor is ever re-delivered (replay policy, architecture §4.5).
- Controller `GET /events/status` (admin JWT): per-consumer lag
  (`max(seq) − last_seq`), DEAD/FAILED counts, last tick time, dispatcher
  lock holder. No mutation endpoints — redrive is the F11 CLI only.

### C.2 `audit/` — read-side

- `GET /audit/citizen/:id` — paged event timeline for a subject.
- `GET /audit/entity/:type/:id` — timeline for an aggregate.
- `GET /audit/search?type=&actor=&from=&to=&correlationId=` — admin search.
- Read-only module; no repository writes; reuses `domain_events` via its own
  read repository (SELECT-only, explicitly exempt from the ownership rule).

### C.3 `tasks/` — Task Engine

- `TaskService.create(input): Task` — validates type/priority; applies
  `dedupe_key` (unique open task per key — duplicate create returns the
  existing task, not an error); writes task + transition + `task.created`
  event in one transaction; when `sla_minutes` or `due_at` present and
  `JOB_QUEUE_ENABLED`, enqueues `TASK_EXPIRY`/`ESCALATION` jobs (deduped).
- `TaskService.transition(id, to, actor, note?)` — enforces the B3 state
  machine; every accepted transition = row + `task.*` event, one transaction.
- `TaskService.escalate(id, actor)` — increments `escalation_level` and
  emits `task.escalated`, one transaction; the ONLY writer of
  `escalation_level` (called by the C.6 `ESCALATION` handler — A5).
- Consumes (flag `TASK_ENGINE_ENABLED`): `alert.raised` → create
  `REVIEW_ALERT` task (dedupe `alert:<alertId>`); `activity.escalated` →
  create `ESCALATION_REVIEW` task (dedupe `activity-escalation:<activityId>`).
- Controller: `GET /tasks?status=&assignedRole=&citizenId=` ·
  `POST /tasks` (manual) · `PATCH /tasks/:id/status` · `GET /tasks/:id`
  (includes transitions). JWT-guarded like existing controllers.

### C.4 `rules/` — Clinical Rules

- `RuleEvaluator` consumes every cataloged event type when
  `CLINICAL_RULES_ENABLED`: load active rules for `trigger_event`; build the
  evaluation context `{ payload, subject, entity }` via `RuleContextBuilder`
  (fixed queries; documents every available field path); evaluate B4.1
  predicate; check daily budget; then either **dry-run** (emit `rule.fired`
  with `payload.simulated=true`, take no action) or execute the B4.2 actions
  through `ActionExecutor` (C.5), emitting `rule.fired` with the action
  results, `causation_id` = triggering event. `rule.suppressed` is emitted
  (same `context` snapshot, no actions) when the predicate **matched** but
  the action was gated — in M28 the only gate is an exhausted daily budget.
  A predicate that does not match emits nothing.
- **Reproducibility (binding):** every `rule.fired` / `rule.suppressed`
  payload embeds `context` — the resolved value of **every field path the
  predicate referenced**, as evaluated. Subject state changes over time;
  the snapshot in the immutable event log is what makes a historical
  clinical decision explainable months or years later without querying
  current patient state (G13).
- `RuleAdminService`: CRUD with save-time validation (predicate fields, ops,
  action params, trigger in catalog); every save bumps `version`, snapshots
  into `clinical_rule_versions`, and emits `rule.definition_changed`.
- Controller: `GET /clinical-rules` · `POST /clinical-rules` ·
  `PATCH /clinical-rules/:id` · `POST /clinical-rules/:id/test` (dry-runs the
  predicate against a supplied sample event payload; no side effects).

### C.5 `workflow/` — Definitions, Runtime, Action Executor

- **ActionExecutor** (refactor, no behaviour change): the existing
  `WorkflowEngine.execute` internals are extracted so each `WorkflowAction`
  handler is callable as `ActionExecutor.run(action, params, ctx)`; the
  legacy `execute(ctx)` façade remains and its call sites
  (`ConsultationService`, `SchedulerService`) are untouched. New action
  types: `CREATE_TASK` (delegates to TaskService), `SCHEDULE_TIMER`
  (enqueues a `WORKFLOW_TIMER`/`REMINDER` job), `RAISE_ALERT` (inserts a
  clinical alert via the CDSE repository path).
- **DefinitionService**: CRUD for B5 with B5.1 publish validation;
  `publish(id)` freezes the version and emits
  `workflow.definition_published`.
- **RuntimeService** (flag `WORKFLOW_RUNTIME_ENABLED`):
  `start(definitionCode, subject, context)`; consumes cataloged events and
  `timer.fired`: for each RUNNING instance whose current state has a matching
  transition, evaluate guard → run actions via ActionExecutor → move state →
  write transition row (**including `guard_context`, the resolved guard
  inputs**) + `workflow.advanced` carrying the same snapshot (one transaction
  per instance). Terminal state → `COMPLETED` + `workflow.completed`. Action
  error → instance `FAILED` + `last_error` set + `workflow.failed` (operator
  visibility via C.1 status; retry of FAILED instances is deferred — H11).
- **Cancel / terminate** (one concept): `POST /workflow-instances/:id/cancel`
  (admin JWT) and rule/system-initiated cancel both call
  `RuntimeService.cancel(id, actor, reason)`: sets `CANCELLED` + emits
  `workflow.cancelled`, and performs minimal cleanup in the same
  transaction — cancels this instance's `PENDING` `scheduled_jobs` and its
  `OPEN` tasks (`source='WORKFLOW' AND source_ref=<instance id>`). Pause /
  resume / compensation are deferred (H11).
- **Legacy mapping seed** (idempotent, runs once): each active `rules` row →
  a `PUBLISHED` definition `LEGACY_<outcome_code>` v1 with one transition,
  `migrated_from_rule_id` set. Instances are NOT auto-started in M28 — the
  seed proves the model expresses real configuration; the legacy lookup path
  remains the active executor (architecture §8.4).

### C.6 `scheduler/` — Job Queue + existing sweeps

- Existing interval loop and `runCycle` behaviour preserved unchanged.
- New (flag `JOB_QUEUE_ENABLED`): each tick additionally drains due
  `scheduled_jobs` per the **B6 execution protocol** (claim via
  `SKIP LOCKED`; handler effects + `DONE` in one transaction — exactly-once
  within the database; exponential backoff on failure; terminal `FAILED` at
  the attempt cap; 10-min stale-lease reclaim). Kind handlers:
  `REMINDER` → emit `reminder.due`; `ESCALATION` → emit
  `escalation.triggered`, and when the payload carries a task the
  escalation-level bump goes through `TaskService.escalate` (C.3 — A5:
  tasks/ owns B3, the scheduler never writes `tasks` directly);
  `TASK_EXPIRY` → `TaskService.transition(EXPIRED)` if still
  open; `WORKFLOW_TIMER` → emit `timer.fired` (runtime consumes);
  `OVERDUE_SWEEP` → reserved (the legacy sweep stays inline in M28).
- When `EVENTS_ENABLED`, the legacy sweep additionally publishes
  `activity.overdue` per processed item (same transaction as its engine call
  is not possible there — publish immediately before `engine.execute`, in
  its own short transaction; documented deviation).
- `GET /scheduler/status` gains `jobs: { pending, running, failed, dead }` —
  additive field only.

### C.7 `notifications/` — Generator

- Module extraction: the existing insert path (`WorkflowRepository.
  insertNotification`) keeps working; internally it is moved behind
  `NotificationService.write()` so there is a single writer.
- Consumer (flag `EVENT_NOTIFICATIONS_ENABLED`): `task.created` (URGENT
  priority only), `task.escalated`, `escalation.triggered`, `alert.raised`,
  `reminder.due` → notification rows with `title`, `severity`, `dedupe_key`
  (e.g. `alert:<id>`), `source_event_id`; each insert emits
  `notification.created` in the same transaction — the module's only
  published event type. Channel remains `IN_APP` only.

### C.8 Producer call sites (R3 — the complete list for M28)

When `EVENTS_ENABLED`, and always inside the producer's existing
transaction — with a single documented exception: the legacy sweep
publishes `activity.overdue` in its own short transaction immediately
before `engine.execute` (C.6):

| Producer | Emits |
|---|---|
| `ConsultationService.save` | `consultation.completed`, `outcome.recorded` |
| `CdseService.classify` | `risk.classified`; `alert.raised` / `alert.resolved` |
| `ActivityService.createActivity/createInitialActivity` | `activity.created` |
| `ActivityService.transition` | `activity.completed` / `activity.rescheduled` / `activity.referred` / `activity.escalated` |
| `EnrollmentService.setStatus/advanceToEvent` | `enrollment.status_changed` |
| `TaskService` | all `task.*` |
| `RuntimeService` | `workflow.started`, `workflow.advanced`, `workflow.completed`, `workflow.cancelled`, `workflow.failed` |
| `RuleEvaluator` | `rule.fired`, `rule.suppressed` |
| `SchedulerService` | `activity.overdue`, `timer.fired`, `reminder.due`, `escalation.triggered` |
| `NotificationGenerator` | `notification.created` |
| `EventBus` (loop guard, A8) | `system.loop_suppressed` |
| Admin services | `rule.definition_changed`, `workflow.definition_published`, `config.changed` |

No other code may publish events in M28.

---

## Part D — Event Payload Contracts (frozen at v1)

Payloads are minimal facts, not entity dumps, and obey **A12**: identifiers
only — no patient names, no free-text clinical notes, no unnecessary PII
(payloads flow into logs and ops endpoints). The catalog's
`allowedPayloadKeys` enforces this at publish time. Examples that bind the
pattern (the full per-type list lives in `events/event-catalog.ts` and
mirrors §4.2):

- `consultation.completed`: `{ activityId, enrollmentId, programId, diseaseId,
  outcomeTypeId, outcomeCategory, recordedBy }`
- `risk.classified`: `{ activityId, riskLevel, disease }`
- `alert.raised`: `{ alertId, riskLevel, disease, activityId }`
- `activity.overdue`: `{ activityId, enrollmentId, dueDate, daysOverdue }`
- `task.created`: `{ taskId, taskType, priority, citizenId, assignedRole,
  dueAt, source, sourceRef }`
- `rule.fired`: `{ ruleId, ruleCode, ruleVersion, simulated, matched: true,
  context: { "<referenced field path>": <resolved value>, ... },
  actions: [{ type, ok, ref }] }` — `context` is the reproducibility
  snapshot (C.4, G13)
- `workflow.advanced`: `{ instanceId, definitionCode, definitionVersion,
  fromState, toState, triggerType, triggerRef,
  guardContext: { "<field path>": <resolved value>, ... } }`
- `timer.fired`: `{ jobId, kind, payload }`

Payload changes after a type ships require `schema_version` bump + both-shape
tolerant consumers. Never rename keys in place.

---

## Part E — API Surface Summary (all additive)

New endpoints (JWT-guarded, admin-role where marked): `GET /events/status`ᴬ ·
`GET /audit/citizen/:id` · `GET /audit/entity/:type/:id` · `GET /audit/search`ᴬ ·
`GET|POST /tasks`, `GET /tasks/:id`, `PATCH /tasks/:id/status` ·
`GET|POST|PATCH /clinical-rules`, `POST /clinical-rules/:id/test`ᴬ ·
`GET|POST /workflow-definitions`, `POST /workflow-definitions/:id/publish`ᴬ ·
`POST /workflow-instances/:id/cancel`ᴬ ·
existing `GET /scheduler/status` gains `jobs` (additive).

Changed endpoints: **none**. Removed: **none**.
*(frontend-optional, separate approval)*: none planned; the Notifications page
keeps working via the existing table shape.

---

## Part F — Implementation Order (small, independently-buildable commits)

Each step = one commit; build green in `backend/`; all flags off ⇒ zero
behaviour change (A9); stop for approval after each.

| # | Commit | Contents | Proof |
|---|---|---|---|
| F0 | M28 contracts | These two documents | reviewed & approved |
| F1 | Events foundation | `events/` module: B1+B2 DDL (log + offsets + consumptions), catalog with allowed-key validation (A12), `EventBus.publish`, unconditional immutability trigger for `domain_events` (B7), status endpoint; no producers yet | build green; tables provision idempotently; any manual UPDATE/DELETE on the log rejected; publish with a disallowed payload key rejected |
| F2 | Producers wired | C.8 call sites emit under `EVENTS_ENABLED`; strict-order singleton dispatcher (advisory lock 28001, consumer offsets, redrive pass) + `ConsumerRegistry` (no consumers registered yet) | flag on in dev: consultation flow writes correct envelopes; two dev processes → exactly one active dispatcher; flag off: byte-identical responses |
| F3 | Audit read-side | `audit/` module + 3 endpoints | timelines render real events from F2 |
| F4 | Task engine core | B3 DDL (+ B7 task trigger), `TaskService`, state machine, controller, task events; **no consumers yet** | manual task CRUD via API; transitions logged + immutable |
| F5 | Job queue | B6 DDL + full execution protocol (one-tx effects+DONE, exponential backoff, terminal FAILED, stale-lease reclaim), kind handlers `REMINDER`/`TASK_EXPIRY`, scheduler status `jobs` field | jobs enqueue/fire in dev; restart-survival demonstrated; forced handler crash → retry with backoff, no double effect |
| F6 | Task consumers + escalation | Task consumers (C.3) under `TASK_ENGINE_ENABLED`; `ESCALATION` job kind; `task.escalated` | alert → task appears exactly once (idempotency proven by forced redelivery) |
| F7 | Clinical rules | B4 DDL, predicate DSL + validator, `RuleEvaluator` (dry-run default), admin endpoints, versioning | rule fires simulated on real event; `/test` endpoint validates predicates; budget enforced |
| F8 | Workflow definitions + executor refactor | B5 DDL + published-definition guard trigger (B7), `ActionExecutor` extraction (legacy façade intact), `DefinitionService` + publish validation, legacy mapping seed | legacy consultation flow regression-tested identical; seed produces one definition per active rule; manual SQL edit of a published graph rejected |
| F9 | Workflow runtime | `RuntimeService` under `WORKFLOW_RUNTIME_ENABLED` (guard-context snapshots, `last_error`), cancel endpoint + cancel cleanup, `WORKFLOW_TIMER` kind, `SCHEDULE_TIMER`/`CREATE_TASK`/`RAISE_ALERT` actions | a demo definition advances end-to-end via events + timer in dev; cancel removes its pending timers/open tasks; transition rows carry guard context |
| F10 | Notification generator | B8 DDL, module extraction, consumer under `EVENT_NOTIFICATIONS_ENABLED`, dedupe | duplicate events produce one notification; legacy insert path unchanged |
| F11 | Hardening & ops | DEAD-letter surfacing, causation-depth tests, **dead-letter redrive CLI** (`scripts/m28_redrive_dead_letters.ts` — resets a named consumer+event to FAILED/attempts=0 for the C.1 redrive pass; this is the ONLY replay mechanism, per §4.5), README for flags/runbook | forced-failure drills pass; a DEAD letter redrives successfully; no tool for arbitrary historical replay exists; documentation complete |

Explicitly out of scope for M28 (future milestones): retiring the legacy
rules path; admin UI; auto-starting workflow instances for existing
enrollments; any non-IN_APP channel; arbitrary historical event replay;
workflow pause/resume, instance retry, compensation (H11); parallel event
dispatch.

---

## Part G — Acceptance Criteria (Definition of Done)

1. **Zero regression:** with all six flags off, every existing API response
   and the consultation → workflow → scheduler behaviour is unchanged
   (verified against the pre-M28 flow on the dev database).
2. **Facts are captured:** with `EVENTS_ENABLED`, one full consultation save
   produces the complete expected event set (C.8) sharing one
   `correlation_id`, in the same transaction as the state change (verified:
   forced rollback leaves no events). The sole same-transaction exception
   in M28 is the legacy sweep's `activity.overdue` (C.6), which is not part
   of the consultation flow.
3. **Immutability holds:** ANY UPDATE or DELETE on `domain_events`,
   `workflow_transitions`, or `task_transitions` raises the B7 exception —
   there are no exempt columns — and content mutation or deletion of a
   PUBLISHED **or RETIRED** workflow definition is rejected (retiring a
   definition must not unfreeze it), all verified via manual SQL as the app
   role.
4. **Idempotency holds:** forced redelivery of any consumed event creates no
   duplicate task, job, notification, or transition.
5. **Loops cannot run away:** a deliberately self-triggering test rule stops
   at causation depth 5 with `system.loop_suppressed` recorded; the daily
   budget independently halts a runaway rule.
6. **Timers are durable and exactly-once:** reminders/escalations scheduled
   before a process restart fire after it; no in-memory-only timer exists;
   a handler crash mid-job produces a backoff retry and never a double
   effect (B6 one-transaction protocol verified by forced crash).
7. **Tasks are centralized:** an `alert.raised` yields exactly one OPEN
   `REVIEW_ALERT` task with full transition history; expiry and escalation
   move it via the scheduler with corresponding events.
8. **Rules are safe by default:** a new rule cannot act until `is_active`
   AND `dry_run=false`; both changes are versioned and audited; predicate
   validation rejects unknown fields/ops at save time.
9. **Workflow lifecycle proven:** the demo definition starts, advances on an
   event, waits on a timer, resumes, completes; each step has an instance
   row, an immutable transition row (with guard context), and a `workflow.*`
   event; published definitions are immutable (database-enforced); cancel
   moves an instance to CANCELLED and cleans up its pending timers and open
   tasks.
10. **Auditability:** for any citizen touched during testing,
    `GET /audit/citizen/:id` reconstructs the ordered story (who/what/when/
    why-chain via correlation + causation) with no gaps.
11. **Ops visibility:** `/events/status` and `/scheduler/status` expose
    per-consumer lag (max seq − offset), DEAD/FAILED letters, dispatcher
    lock holder, and job counts.
12. **Build discipline held:** every F-commit built green and was
    individually approved; `scripts/milestone28_workflow_engine.sql` applies
    cleanly on a fresh database and is a no-op on an existing one.
13. **Reproducibility:** every `rule.fired`/`rule.suppressed` payload and
    every workflow transition carries the resolved evaluation-context
    snapshot; a historical decision is fully explainable from the event log
    and transition rows alone, without querying current patient state.
14. **Replay is bounded:** a `DEAD` delivery can be redriven via the F11 CLI
    and succeeds; no mechanism exists to replay already-consumed history;
    event payloads contain no patient names or free-text clinical notes
    (A12 spot-check across all C.8 producers).

---

## Part H — Resolved Decisions (developers do not choose)

- **H1** Outbox-in-PostgreSQL, in-process dispatcher: **strict global `seq`
  order, one event at a time, single active instance via
  `pg_try_advisory_lock(28001)`**. No broker, no `@nestjs/event-emitter`, no
  LISTEN/NOTIFY in M28 (polling is sufficient at current scale; NOTIFY is a
  documented future optimization). Per-subject / per-consumer parallelism is
  intentionally deferred; the offsets model admits it later with no schema
  change.
- **H2** `domain_events` doubles as the immutable audit log; there is no
  separate audit table. The log is strictly **INSERT-only** — delivery state
  lives in `consumer_offsets`/`event_consumptions`, and no table declares an
  FK into the log (soft uuid references only). Retention/partitioning is
  deferred; the design is partition-ready (`seq` ordering, time-based
  queries, no inbound FKs).
- **H3** Tasks are **not** worklist items. `worklist_items` = clinical
  care-plan spine (unchanged, drives the frozen M27 Dashboard);
  `tasks` = operational work queue. They link via `tasks.worklist_item_id`.
- **H4** The legacy outcome→rules engine remains the action executor and the
  active consultation path throughout M28. Nothing existing is retired.
- **H5** Predicate DSL is the closed B4.1 vocabulary — no JS eval, no
  expression language dependency.
- **H6** Causation depth cap = 5; consumer retry cap = 5; default dispatch
  interval 2 s; default dispatch batch = 100 events per consumer per tick
  (`EVENTS_DISPATCH_BATCH`); dispatcher advisory-lock key = 28001; job lease timeout
  10 min; job retry backoff = `LEAST(2^attempts, 60)` minutes; job
  max_attempts default 3 (then terminal FAILED); rule daily budget
  default 200.
- **H7** Actor model: `USER` (JWT user id), `SYSTEM` (component constant),
  `RULE` (rule id). `SYSTEM_SCHEDULER` stays the recordedBy for the legacy
  sweep for continuity.
- **H8** All M28 features ship dark (flags off) in every environment until
  the user explicitly approves each flip, phase by phase.
- **H9** No ORM is introduced; raw SQL in owning repositories, provisioned
  idempotently + mirrored in the milestone script (established convention).
- **H10** Event names, payload keys, table names, and flag names in this
  contract are frozen; changes require a contract amendment approved before
  code.
- **H11** Workflow lifecycle scope: **cancel/terminate (one concept) is in
  M28**, with minimal cleanup (pending timers + open source-ref'd tasks) and
  `last_error` capture on FAILED. **Deferred to a later milestone:**
  pause/resume (resume semantics for events arriving while paused need
  their own design), retry of FAILED instances (requires idempotent action
  re-execution; `last_error` makes it possible later), and
  compensation/sagas (major machinery; M28 actions are create-only, for
  which cancel cleanup suffices).
- **H12** Replay = **dead-letter redrive only** (F11 CLI + C.1 redrive
  pass). Arbitrary historical replay is prohibited in M28: live-scoped
  dedupe keys mean replaying old events would re-create already-completed
  clinical work. It becomes admissible only with pure, side-effect-free
  projections in a future milestone (architecture §4.5).
