# Milestone 28 — Workflow Engine & Clinical Automation **Architecture**

**Status:** APPROVED — FROZEN (2026-07-02, F0 review complete). Amendments
require explicit approval before any code. Companion:
`milestone28_implementation_contract.md` (binding; frozen the same date).

**Scope discipline (binding):** backend-first. No UI redesign, no AI, no
analytics, no mobile support. The M27 frontend (including the frozen Dashboard
Worklist) is consumed as-is; any UI exposure of M28 capabilities is a future
milestone.

---

## 1. Where we are today (current-state analysis)

M28 does not start from zero. The codebase already contains the seeds of every
M28 objective, built across M16–M25:

| Capability | Exists today as | Limitation M28 removes |
|---|---|---|
| Workflow engine | `workflow/workflow.engine.ts` — DB-driven: `outcome_type → rules row → one of 9 WorkflowActions` | Only fires on **consultation outcomes**; single-step (no multi-state lifecycle); actions hard-wired to Activity/Enrollment services |
| Scheduler | `scheduler/scheduler.service.ts` — 60s interval, sweeps overdue PENDING activities through the engine via the NO_RESPONSE outcome | One hard-coded sweep; no durable timers; cannot schedule "remind X in 3 days" or "escalate if not done by Friday" |
| Tasks / work queue | `worklist_items` (care-plan activities) | Conflates *clinical care-plan activities* with *operational work for humans*; no assignment, no SLA, no independent task lifecycle |
| Clinical rules | `rules` + `retry_config` (+ CDSE category thresholds from M25) | Keyed only by outcome type; conditions column is action metadata, not evaluable predicates; no versioning; no rule-change audit |
| Events | — none — | All integration is synchronous service calls; adding a consumer means editing the producer |
| Notifications | `notifications` table, best-effort insert from the engine | Generation is scattered; no dedupe; no linkage to what caused them |
| Audit | — none (only data-quality keeps review notes) | No immutable record of what happened, who did it, and why |

**The architectural insight:** the engine, the scheduler, the CDSE, and the
notification writes are all *reactions to things that happened* — a
consultation completed, an activity became overdue, a risk was classified.
What is missing is the **thing that happened** as a first-class, durable,
immutable record. M28 therefore introduces a **domain event spine** and
re-seats the existing machinery on top of it.

---

## 2. Objectives → architectural answers

| M28 objective | Architectural answer |
|---|---|
| Reusable workflow engine | Versioned, declarative **workflow definitions** (state machines in data) executed by a generalized engine; the existing outcome→action engine becomes the *action executor* it already is |
| Centralized task engine | New `tasks` aggregate with its own lifecycle, assignment, priority, SLA and escalation level — distinct from care-plan `worklist_items`, linked to them when relevant |
| Configurable clinical rules | New `clinical_rules`: versioned rows whose **trigger is an event type** and whose **condition is an evaluable predicate** over the event payload + subject context; actions are declarative |
| Event-driven architecture | **Transactional outbox** (`domain_events`, INSERT-only) written in the same DB transaction as the state change; a single in-process dispatcher delivers in strict log order via per-consumer offsets, at-least-once; PostgreSQL is the only broker |
| Scheduler for reminders & escalations | Durable **`scheduled_jobs`** queue (run_at, kind, payload, lease) processed by the existing scheduler loop; timers become rows, surviving restarts |
| Notifications from workflow events | A `NotificationGenerator` **subscriber** — the only writer of `notifications` — with dedupe keys and provenance (`source_event_id`) |
| Immutable audit events | `domain_events` **is** the audit log: append-only, UPDATE/DELETE forbidden at the database level, every row carries actor, subject, correlation and causation |

---

## 3. Architecture overview

```
                       ┌────────────────────────────────────────────────┐
                       │                COMMAND SIDE (unchanged APIs)   │
   Consultation save   │  Registration · Enrollment · Consultation ·    │
   Task actions  ──────▶  Activity · Data-Quality · Admin              │
                       └───────────────┬────────────────────────────────┘
                                       │ same DB transaction
                                       ▼
                        ┌──────────────────────────────┐
                        │  domain_events  (OUTBOX +     │   INSERT-only,
                        │  IMMUTABLE AUDIT LOG)         │   never mutated
                        └──────────────┬───────────────┘
                                       │ EventDispatcher — single instance
                                       │ (pg advisory lock), strict global
                                       │ seq order, consumer_offsets cursors,
                                       │ at-least-once delivery
             ┌─────────────────┬───────┴───────┬──────────────────┬─────────────┐
             ▼                 ▼               ▼                  ▼             ▼
   ┌──────────────┐  ┌─────────────────┐ ┌───────────────┐ ┌───────────┐ ┌──────────┐
   │ RuleEvaluator│  │ WorkflowRuntime  │ │ TaskEngine    │ │ Notif.    │ │ (future  │
   │ clinical_    │  │ workflow_        │ │ tasks         │ │ Generator │ │ consumers│
   │ rules        │  │ instances        │ │               │ │           │ │ plug in  │
   └──────┬───────┘  └───────┬─────────┘ └──────┬────────┘ └─────┬─────┘ │ here)    │
          │ actions          │ transitions      │ task events    │       └──────────┘
          └───────► emit new commands/events (with causation) ◄──┘
                                       ▲
                        ┌──────────────┴───────────────┐
                        │  scheduled_jobs (durable      │  reminders,
                        │  timers) → SchedulerService   │  escalations,
                        │  fires `timer.fired` events   │  recurring sweeps
                        └──────────────────────────────┘
```

Principles:

1. **Events are facts, not commands.** `consultation.completed` states what
   happened; consumers decide what to do. Producers never know their consumers.
2. **The outbox is the audit log — and it is INSERT-only.** One table serves
   both purposes; there is no separate "audit service" that can drift from
   reality. Immutability is enforced in PostgreSQL itself by an
   *unconditional* trigger rejecting every UPDATE and DELETE. Delivery
   mechanics never touch a fact row: dispatch progress lives outside the log
   in `consumer_offsets`.
3. **State lives where it lives today.** This is *not* event sourcing.
   `worklist_items`, `enrollments`, `tasks` remain the source of truth for
   current state; `domain_events` is the source of truth for *history*.
4. **At-least-once delivery, exactly-once effects.** The dispatcher tracks
   its position per consumer in `consumer_offsets` and may redeliver after a
   crash; every consumer records processed event ids (`event_consumptions`)
   in the same transaction as its effects. Because all effects live in the
   one PostgreSQL database, this yields exactly-once *effects* on top of
   at-least-once *delivery*.
5. **Loop safety.** Every derived event carries `causation_id` and
   `correlation_id`; the dispatcher enforces a maximum causation depth so a
   misconfigured rule can never create an infinite cascade.
6. **PostgreSQL is the only infrastructure.** Single-node deployment, no
   broker, no Redis. Job concurrency via `FOR UPDATE SKIP LOCKED` leases; the
   event dispatcher is a strict singleton guarded by `pg_try_advisory_lock`.
   If DiNC later scales out, the log + consumer-offset model ports to a
   broker unchanged.
7. **Evolve, don't replace.** The existing engine, scheduler loop, rules
   table, and every public API keep working at every commit. New behaviour
   arrives behind explicit feature flags, default **off**, flipped only per
   the contract's phase gates.

---

## 4. Event model

### 4.1 Envelope (every event)

| Field | Meaning |
|---|---|
| `id` | uuid, primary key |
| `event_type` | dot-namespaced past-tense fact, e.g. `consultation.completed` |
| `schema_version` | integer; payload shape version for that type |
| `occurred_at` | when the fact happened (tx time) |
| `actor_type` / `actor_id` | `USER` (users.id), `SYSTEM` (component name), or `RULE` (rule id) |
| `subject_type` / `subject_id` | the patient-centric anchor — almost always `CITIZEN`/citizens.id; nullable for pure system events |
| `entity_type` / `entity_id` | the aggregate the event is about (`WORKLIST_ITEM`, `TASK`, `ENROLLMENT`, `CLINICAL_ALERT`, …) |
| `correlation_id` | groups everything triggered by one root interaction |
| `causation_id` | the event id that directly caused this one (null for roots) |
| `causation_depth` | 0 for roots; dispatcher rejects publishes beyond the cap |
| `payload` | jsonb, type-specific, validated against the event catalog |

### 4.2 Event catalog (initial — the contract freezes exact payloads)

- **Clinical flow:** `consultation.completed` · `outcome.recorded` ·
  `risk.classified` (CDSE) · `alert.raised` · `alert.resolved`
- **Care plan:** `activity.created` · `activity.completed` ·
  `activity.rescheduled` · `activity.referred` · `activity.escalated` ·
  `activity.overdue` · `enrollment.status_changed`
- **Tasks:** `task.created` · `task.assigned` · `task.started` ·
  `task.completed` · `task.cancelled` · `task.expired` · `task.escalated`
- **Workflow runtime:** `workflow.started` · `workflow.advanced` ·
  `workflow.completed` · `workflow.cancelled` · `workflow.failed`
- **Automation:** `rule.fired` · `rule.suppressed` (condition matched but
  action gated — in M28: daily budget exhausted) · `timer.fired` ·
  `reminder.due` · `escalation.triggered` · `system.loop_suppressed`
  (published by the EventBus itself when the causation-depth cap rejects a
  publish)
- **Delivery:** `notification.created` (published by the
  NotificationGenerator, its sole event type)
- **Administration (audit-critical):** `rule.definition_changed` ·
  `workflow.definition_published` · `config.changed`

Naming law: `aggregate.verb_in_past_tense`, lowercase, dot-separated
(documented exception: `reminder.due` uses a state adjective and is kept for
readability). New types are added to the catalog file first; publishing an
uncataloged type is a startup-time error.

### 4.3 Ordering & delivery semantics

- **Strict global order.** Events are dispatched one at a time in `seq`
  order by a single dispatcher instance (guarded by `pg_try_advisory_lock`;
  a second process that fails to take the lock stays passive). Per-subject
  and per-consumer parallelism are **intentionally deferred** — at current
  scale one strictly-ordered lane is both simpler and a stronger guarantee,
  and the offsets model admits parallelism later without schema change.
- **Consumer offsets, not row status.** `domain_events` carries no delivery
  state. Each consumer's position is a cursor in `consumer_offsets`
  (`consumer → last_seq`): dispatching reads `seq > last_seq` and advances
  the cursor after delivery.
- **At-least-once delivery, exactly-once effects.** Redelivery can happen
  after a crash; consumers record `(consumer, event_id)` in
  `event_consumptions` in the same transaction as their effects, via the
  events module's ledger helper (an upsert): an existing `OK` row means
  already processed — skip effects, return success; an existing `FAILED`
  row (a prior failed attempt, or a redrive marker) is flipped to `OK` by
  the successful retry in the same transaction as the effects. Duplicates
  are thus detected and effects — all in the same PostgreSQL — commit
  exactly once.
- **Poison events.** After 5 failed attempts a delivery is marked `DEAD` in
  `event_consumptions`, surfaced on the ops status endpoint, and the cursor
  advances past it — never silently dropped, never blocking the lane. The
  consequence is a documented per-consumer gap: consumers must tolerate not
  having seen every event for a subject (all M28 consumers do).

### 4.4 Payload policy (mandatory)

Event payloads carry **identifiers only** — uuids, UHIDs, codes, enum
values, timestamps and counts. Never patient names, never free-text
clinical notes, never contact details or any PII that is not strictly an
identifier. Payloads flow into logs, ops endpoints and (later) exports;
this rule keeps the event log aligned with DiNC's UHID-first, minimal-PII
posture. The catalog defines each type's allowed keys and publish-time
validation rejects anything outside them.

### 4.5 Replay policy

Replay in M28 is **dead-letter redrive only**: retrying `FAILED`/`DEAD`
deliveries for a named consumer. Arbitrary historical replay is explicitly
out of scope because it is clinically unsafe today: operational dedupe keys
are intentionally scoped to *live* rows (e.g. one open task per
`dedupe_key`), so replaying a months-old `alert.raised` would re-create
work that was already completed. Unrestricted replay becomes admissible
only when a future milestone introduces pure projections (read-models with
no side effects).

---

## 5. Workflow lifecycle

### 5.1 Definitions (design-time)

A **workflow definition** is a versioned, declarative state machine stored as
data (jsonb), never as code:

- `states`: named states with a type (`normal | terminal | wait`); exactly
  one non-terminal state carries `initial: true` (validated at publish)
- `transitions`: `from → to` with a **trigger** (an event type, a timer, or a
  manual action), an optional **guard** (same predicate DSL as clinical
  rules), and a list of **actions** (the existing `WorkflowAction` vocabulary,
  extended with `CREATE_TASK`, `SCHEDULE_TIMER`, `RAISE_ALERT`)
- Lifecycle of a definition: `DRAFT → PUBLISHED → RETIRED`. A published
  version is **immutable — database-enforced by trigger**, like every other
  immutable M28 object; retirement does not unfreeze it — RETIRED versions
  stay equally immutable and cannot be deleted, so pinned history remains
  reproducible forever; corrections are a new version. Running instances
  keep the version they started with (no instance migration in M28), so any
  historical run is always reproducible from its pinned definition plus its
  transition log.

### 5.2 Instances (run-time)

A **workflow instance** binds a published definition version to a subject
(enrollment, task, or citizen):

```
        start (event/rule/manual)
              │
              ▼
        ┌──► RUNNING ── transition (event + guard) ──► RUNNING' … ─► COMPLETED
        │       │                                          │
 timer ─┘       ├── cancel (manual/rule) ─► CANCELLED      └─► FAILED (action
                └── definition retired? instances continue      error + last_error,
                    on their pinned version                     parked for operator)
```

Every accepted transition writes, in one transaction: the instance row
update, an immutable `workflow_transitions` row **including the resolved
guard-context snapshot** (the exact field values the guard evaluated), and a
`workflow.advanced` domain event carrying the same snapshot — so *why* an
instance advanced remains answerable years later, even after patient state
has changed. Rejected triggers (guard false) are not recorded in M28 — the
transition simply does not occur; `rule.suppressed` belongs exclusively to
the rules module (§4.2). Guard-rejection tracing is a future-milestone
observability concern.

**Cancel / terminate** (in scope for M28): one concept — a manual or
rule-driven cancel moves the instance to `CANCELLED` and performs minimal
cleanup: its pending timers (`scheduled_jobs`) are cancelled and its open
source-ref'd tasks are cancelled. `FAILED` instances persist `last_error`
so they are diagnosable and retryable in a later milestone.

**Deferred to a later milestone** (with reasons):
- *Pause / resume* — resume semantics (what happens to events that arrived
  while paused?) need their own design; M28 workflows are short-lived.
- *Retry a FAILED instance* — requires idempotent re-execution of the failed
  action; `last_error` captured now makes this possible later.
- *Compensation / sagas* — general undo machinery is major scope; M28
  actions are create-only (tasks, timers, alerts, notifications), for which
  the cancel cleanup above is sufficient.
- *Restart* — needs no machinery: it is "start a new instance".

### 5.3 Relationship to the existing engine

The current outcome→action engine is *kept* and re-labelled for what it is:
the **action executor**. Workflow transitions and clinical rules both resolve
to the same action vocabulary and call the same executor, so retry policies,
referral creation and enrollment status changes continue to have exactly one
implementation. The legacy path (consultation → rules row → action) is
re-expressed as generated single-transition definitions during migration, and
remains functional throughout.

---

## 6. Service boundaries

| Module (NestJS) | Owns (tables) | Responsibility | May call |
|---|---|---|---|
| `events/` | `domain_events`, `event_consumptions`, `consumer_offsets` | Publish-in-tx API, singleton dispatcher (advisory lock, strict seq order), catalog + payload-key validation, causation guard, dead-letter redrive | consumers (via registry only) |
| `audit/` | *(reads `domain_events`)* | Query/read API: timeline per citizen/entity/actor, admin audit search | — |
| `tasks/` | `tasks`, `task_transitions` | Task lifecycle, assignment, SLA/escalation levels; emits task events | `events` |
| `rules/` | `clinical_rules`, `clinical_rule_versions` | Rule CRUD (versioned), predicate evaluation on subscribed events, action dispatch | `events`, action executor |
| `workflow/` | existing + `workflow_definitions`, `workflow_instances`, `workflow_transitions` | Definition registry, instance runtime, **action executor** (existing engine) | `activity`, `enrollment`, `tasks`, `events` |
| `scheduler/` | `scheduler_runs`, `scheduled_jobs` | Durable job queue (leases), recurring sweeps, fires `timer.fired`/`activity.overdue` | `events`, `workflow` |
| `notifications/` *(module extracted)* | `notifications` (+ new columns) | Sole writer of notifications, driven by events, dedupe | `events` (consumes; publishes `notification.created` only) |

Boundary laws:

- Only a table's owning module issues SQL against it (the established
  repository discipline).
- Consumers never call other consumers; cross-consumer effects travel as
  events.
- The action executor is the single place that mutates care-plan state on
  behalf of automation; rules and workflows *choose* actions, they never
  reach into `activity`/`enrollment` services directly.
- Controllers added in M28 are admin/ops-facing and additive; no existing
  endpoint changes shape.

---

## 7. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Clinical safety** — a misconfigured rule mass-creates tasks/escalations | Rules ship `is_active=false` by default; mandatory dry-run mode (`rule.fired` with `simulated=true`, no actions) before activation; per-rule daily action budget; every activation is itself an audit event |
| R2 | **Event loops** — rule A's action triggers rule B triggering A | `causation_depth` cap (contract fixes the number), per-correlation action budget, loop detection surfaced in ops status |
| R3 | **Dual-write drift** — producer forgets to emit an event | Publishing happens inside the same `withTransaction` as the state change via a shared helper (single documented exception: the legacy sweep's `activity.overdue`, contract C.6); contract lists the exact producer call sites; acceptance tests assert event presence per flow |
| R4 | **Poller load** on PostgreSQL (dispatcher + jobs + sweeps) | Cursor reads by indexed `seq` (offsets model — no status scans); `FOR UPDATE SKIP LOCKED` job leases; batching; configurable intervals; dispatcher singleton via `pg_try_advisory_lock` |
| R5 | **At-least-once duplicates** create double tasks/notifications | `event_consumptions` unique constraint; natural dedupe keys (`tasks.dedupe_key`, `notifications.dedupe_key`) |
| R6 | **Audit table growth** | INSERT-only (zero dead tuples), `seq`-ordered and partition-ready; **soft references only** into the log (no inbound FKs) so future partitioning/archival is unconstrained; no deletes in M28 (retention is a deferred governance decision, documented) |
| R7 | **In-flight state at migration** — activities mid-retry when flags flip | Strangler strategy: legacy engine remains the executor; flags gate only *new* trigger paths; no data rewrite of existing worklist rows |
| R8 | **Scope creep into UI** | Contract forbids frontend changes except (optionally, flagged) additive JSON fields; the M27 freeze on the Worklist stands |
| R9 | **Scheduler restart loses timers** | Timers are rows (`scheduled_jobs`), not in-memory intervals; the interval loop only *drains* the queue |
| R10 | **Windows single-node ops** — no external infra allowed | All coordination in PostgreSQL; **zero new npm dependencies** (contract A3 — the dispatcher is a plain interval loop; `@nestjs/event-emitter` is explicitly not used) |

---

## 8. Migration strategy (strangler, flag-gated)

1. **Additive schema only.** Every new table ships as idempotent
   `CREATE TABLE IF NOT EXISTS` in its owning repository *and* as
   `scripts/milestone28_workflow_engine.sql` (the established dual-path
   convention). No existing table is altered destructively; new columns are
   nullable/defaulted.
2. **Shadow first, then authoritative.** Each capability passes through:
   *(a)* emit/record only (nothing consumes) → *(b)* consume in shadow
   (compute, log `simulated`, take no action) → *(c)* flag on (acts) →
   *(d)* legacy path retired **only** with explicit approval in a later
   milestone. M28 ends at (c) with legacy intact.
3. **Feature flags** (env, default off): `EVENTS_ENABLED`,
   `TASK_ENGINE_ENABLED`, `CLINICAL_RULES_ENABLED`, `WORKFLOW_RUNTIME_ENABLED`,
   `JOB_QUEUE_ENABLED`, `EVENT_NOTIFICATIONS_ENABLED`. Rollback of any phase =
   flip its flag; the schema is inert when unused.
4. **Legacy rules mapping.** A one-time idempotent seed expresses each active
   `rules` row as a single-transition workflow definition (`v1`, tagged
   `migrated_from_rule_id`) — proving the definition model against real
   configuration without changing behaviour (the legacy lookup remains the
   active path until parity is verified).
5. **No API breakage.** Existing DTOs only ever gain optional fields.
   Frontend requires zero changes to keep working.

---

## 9. Explicit non-goals (M28)

- No UI redesign; no new pages. (Admin UI for definitions/rules/tasks is a
  candidate for M29+.)
- No AI/LLM anything; rules are deterministic predicates.
- No analytics/reporting on the event stream.
- No mobile, no push/SMS/email channels — `IN_APP` only.
- No event sourcing of aggregates; no external broker; no microservices.
- No arbitrary historical event replay — dead-letter redrive only (§4.5).
- No workflow pause/resume, instance retry, or compensation framework
  (§5.2 records the reasons); no instance migration between definition
  versions.
- No parallel event dispatch — single strictly-ordered lane (§4.3).
- No retirement of the legacy rules path (that is a later, separately
  approved milestone).

---

## 10. Companion document

`docs/milestone28_implementation_contract.md` is the **binding** how: exact
DDL, module and API contracts, event catalog payloads, flag gates, phase/commit
order, acceptance criteria, and resolved decisions. Where this document and
the contract disagree, the contract wins.
