# DiNC — Digital Integrated Care Network

**Version 1.0.0 RC1** · Public health operations platform for NHM field teams
(Assam), covering the full citizen care journey: registration → program
enrollment → scheduled activities → teleconsultation with clinical decision
support → outcomes → automated follow-ups → analytics.

## Monorepo structure

| Path        | What it is                                                          |
|-------------|---------------------------------------------------------------------|
| `backend/`  | NestJS 10 REST API (`/api` prefix) over PostgreSQL via `pg` (no ORM) |
| `frontend/` | Next.js 14 (App Router) client — talks to the backend only, never to PostgreSQL directly |
| `scripts/`  | SQL seed / migration scripts applied manually with `psql`           |
| `docs/`     | Design contracts and architecture notes for major milestones        |

## Core modules

- **Dashboard** — fixed-viewport operations command centre: KPI ribbon (clickable drill-downs), Today's Worklist, Priority Alerts. UHID-only patient identity.
- **Worklist** — permission-scoped activity queue with live client-side filters and per-row actions (consult, guidebook, citizen record, report duplicate).
- **Citizens** — three-panel workspace: registry list, citizen summary + enrollments, activity timeline; Clinical Journey view.
- **Registration & Enrollment** — single + bulk (CSV/Excel) registration with duplicate detection; program → sub-program → disease → event enrollment that assigns a worker and auto-creates the first activity.
- **Consultation** — one consultation workspace application-wide: call lifecycle, counselling wizard driven by seeded protocols, auto-generated documentation, outcome capture.
- **CDSE** — category-based risk classification (NONE/LOW/MODERATE/SEVERE) from structured consultation responses; writes `clinical_alerts`; goal suggestions feed care plans.
- **Workflow Engine** — rules (`rules` table) that react to outcomes: create/reschedule activities, escalate, notify; executed on consultation save and by the scheduler.
- **Notifications / Action Centre** — SEVERE-only alert feed (TopBar bell, Notifications page, Dashboard Priority Alerts — one SQL source of truth).
- **Guidebooks** — data-driven clinical guidebooks composed live from JSONB sections + counselling protocols; JSON import, bulk upload, version history, branded PDF export.
- **Knowledge Hub** — FAQs (admin-editable), training modules, emergency protocols, unified search.
- **Reports & Analytics** — 11 tabs (Operations, Executive, Clinical Risk, Diseases, Programs, Worklist, Workers, Registrations, Scheduler, Workflow, Knowledge) with shared filters.
- **Administration** — users & roles, workflow rules, scheduler, system settings, data quality (duplicate merge/delete workflow), account settings.

## Roles

`ADMIN`, `CLINICIAN`, `ANM`, `CARE_ASSISTANT`. The frontend permission map lives
in `frontend/src/lib/permissions.ts`; the backend mirrors the scoping (e.g.
`worklist.view.all`) in its guards. See [API.md](API.md) for per-endpoint
requirements.

## Quick start

```bash
# Backend (http://localhost:4000/api)
cd backend
cp .env.example .env   # fill in PostgreSQL credentials + JWT secret
npm install
npm run start:dev

# Frontend (http://localhost:3000)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Full instructions, including database seeding: [INSTALLATION.md](INSTALLATION.md).

## DiNc database migration (in progress)

The backend is being migrated from the legacy `cphc` database to the
metadata-driven `DiNc` database (schemas `dinc_metadata`, `dinc_runtime`,
`dinc_security`, `dinc_audit`, plus the backend-owned `dinc_app`). Metadata is
**read-only** (release v1.8); changes occur only via workbook → review → new
metadata release → deployment.

Status: **Steps 0–5 + 6A complete** — activity lifecycle progression is live:
`POST /api/activity-instances/:id/complete` completes an activity, activates
the next one by display order, auto-completes the event when all are done, and
activates dependent events from `v_schedule_rule_effective` (ONE_TIME,
previous-event-completion anchored, unconditional) with their activity
instances — all in one transaction. Recurring/birth-date/override rules and
follow-up generation are Step 6B. Registration is metadata-driven: enrolling
a patient creates the patient + programme enrolment and instantiates only the
initially-active events (ONE_TIME, registration-anchored, dependency-free
schedule rules from `v_schedule_rule_effective`) with their PENDING activity
instances, stamped with the metadata release. Dependent/recurring events are
the Step 6 scheduler's job. Additionally — the backend boots against DiNc, authentication
uses `dinc_security.app_user` + `user_credential`, all backend-owned
operational tables self-provision in `dinc_app`, every programme/event/
activity metadata read comes from `dinc_metadata` (read-only), patient +
programme-enrolment reads come from `dinc_runtime.patient` /
`programme_enrolment` (uhid→external_id, gender→sex, age derived from
birth_date), and the worklist derives from
`event_instance → activity_instance → followup_task` (ACTIVE→PENDING,
overdue = past-due PENDING, current activity = first incomplete
activity instance, follow-up tasks surfaced as FOLLOW_UP items). The old
program → sub-program → disease → event cascade is shimmed onto the new
programme → event → activity hierarchy. Roles in DiNc are `ADMIN`,
`SUPERVISOR`, `CARE_MANAGER`. Writes (registration, enrolment creation,
activity lifecycle, scheduling) and remaining modules migrate in Steps 5–11.
Dev read fixtures: `scripts/dinc_step3_dev_fixtures.sql`,
`scripts/dinc_step4_dev_fixtures.sql`.

To run against DiNc set `PGDATABASE=DiNc` in the environment (see
`backend/.env.dinc`). Provisioning: `scripts/dinc_step1_foundation.sql`.
Plan and per-module analysis: [docs/MIGRATION_ANALYSIS_v1.md](docs/MIGRATION_ANALYSIS_v1.md).

## Documentation

| Document | Contents |
|----------|----------|
| [INSTALLATION.md](INSTALLATION.md) | Local setup, environment variables, seeds |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment, reverse proxy, backups |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and module design |
| [DATABASE.md](DATABASE.md) | Table inventory and relationships |
| [API.md](API.md) | Endpoint reference with role requirements |
| [CHANGELOG.md](CHANGELOG.md) | Milestone history to v1.0.0 RC1 |
| [RELEASE_NOTES_v1.0.0_RC1.md](RELEASE_NOTES_v1.0.0_RC1.md) | RC1 features, tested workflows, known limitations |
| `docs/` | Frozen design contracts (M27 workspace UX, M28 workflow engine) |
