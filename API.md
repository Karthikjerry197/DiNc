# DiNC API Reference

Base URL: `http://<host>:4000/api`. All responses are JSON. Validation uses
whitelisted DTOs — unknown body fields are rejected (400).

## Authentication

```
POST /api/auth/login          { username, password }
  → { token, username, full_name, role }
```

Send the token on every other request: `Authorization: Bearer <token>`.
Tokens expire after `JWT_EXPIRES_IN` (no refresh tokens — sign in again).

| Endpoint | Notes |
|---|---|
| `GET  /auth/me` | Current user (also validates the token) |
| `POST /auth/change-password` | `{ currentPassword, newPassword }` (min 8 chars) |
| `GET  /auth/dev/users` · `POST /auth/dev/switch-user` | Development user switching |

**Roles**: `ADMIN`, `CLINICIAN`, `ANM`, `CARE_ASSISTANT`. Below,
*Authenticated* = any signed-in role; *ADMIN* = admin-guarded server-side
(403 otherwise). List/overview endpoints additionally **scope rows** to the
caller's assignments unless the role has `view.all` (ADMIN).

## Citizens & registration — *Authenticated*

| Endpoint | Purpose |
|---|---|
| `GET  /citizens/list` | Registry list (programs, diseases, risk, workers per citizen) |
| `GET  /citizens/:id` | Citizen detail |
| `POST /citizens` · `POST /citizens/bulk` | Create (used by registration flows) |
| `GET  /registration/options` | Programs + assignable workers for the wizard |
| `POST /registration/check-duplicates` | `{ uhid?, phone?, aadhaar? }` → candidate matches |
| `POST /registration` · `POST /registration/bulk` | Register one patient / CSV-Excel batch |

## Enrollment & activities — *Authenticated*

| Endpoint | Purpose |
|---|---|
| `GET /programs` → `/programs/:id/sub-programs` → `/sub-programs/:id/diseases` → `/diseases/:id/events` | Cascading catalogue |
| `GET/POST /citizens/:citizenId/enrollments` | List / create enrollment (stores worker, auto-creates first activity) |
| `GET /enrollments/:id` · `GET /enrollments/:id/guidebook` | Enrollment detail / linked guidebook |
| `GET/POST /enrollments/:enrollmentId/activities` | Activities per enrollment |
| `GET /enrollments/:enrollmentId/activity-options` | Event options for Add Activity |
| `GET /activities/:activityId` | Activity detail |

## Worklist & dashboard — *Authenticated, scoped*

| Endpoint | Purpose |
|---|---|
| `GET /worklist/admin/overview` | Stats + items + filters + team monitoring (monitoring: ADMIN-scoped) |
| `GET /worklist/items/:itemId/guidebook` | Item → guidebook resolution |
| `GET /dashboard/admin/summary` | KPI stats, risk block (low/moderate/severe), today's worklist |
| `GET /dashboard/layout` · `PUT /dashboard/layout` | Dashboard Studio layout (PUT: *ADMIN*) |

## Consultation — *Authenticated*

| Endpoint | Purpose |
|---|---|
| `GET  /activities/:activityId/consultation` | Full context: patient, clinical context, counselling sections, previous note |
| `POST /activities/:activityId/start-call` | Call initiation (returns dial info) |
| `POST /activities/:activityId/consultation` | **Save outcome** — persists responses + note, runs CDSE, fires workflow rules; returns completion info |
| `GET/POST /activities/:activityId/consultation-note` | Draft note read / autosave |
| `GET /citizens/:citizenId/clinical-journey` · `/timeline` · `/consultation-history` · `/active-activity` | Longitudinal views |

## CDSE & alerts — *Authenticated*

| Endpoint | Purpose |
|---|---|
| `GET /citizens/:citizenId/risk` | Current risk classification |
| `GET /citizens/:citizenId/alerts` | Citizen's alerts |
| `GET /alerts/active?status=ACTIVE|RESOLVED` | Action Centre feed — **SEVERE only**; each alert carries `isRead`, unread listed first |
| `POST /alerts/:id/read` | Mark one alert read (idempotent; first read wins) |
| `GET /citizens/:citizenId/cdse-recommendations` | Goal suggestions |

## Care plans — *Authenticated*

CRUD over `citizens/:citizenId/care-plan`, then `care-plans/:id` with nested
`problems` → `goals` → `interventions`, `progress` (append-only), and
`cdse-suggestions` / `cdse-decisions`. See `care-plan.controller.ts` for the
full route list — request/response shapes mirror the frontend types in
`frontend/src/lib/api.ts`.

## Guidebooks & knowledge

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /guidebooks/list` · `GET /guidebooks/:id` · `GET /guidebooks/:id/versions` | Authenticated | List / live-composed detail / version history |
| `POST /guidebooks` · `POST /guidebooks/bulk` | *ADMIN* | JSON import / bulk import |
| `GET /knowledge/faqs` · `/training` · `/emergency` · `/search?q=` | Authenticated | Knowledge Hub |
| `POST /knowledge/faqs` · `/faqs/:id` · `/faqs/:id/delete` | *ADMIN* | FAQ management |

## Analytics — *Authenticated (reports.view roles)*

`GET /analytics/<report>` where `<report>` ∈ `operations`, `executive`,
`programs`, `worklist`, `workers`, `registrations`, `scheduler`, `workflow`,
`knowledge`, `risk`, `diseases`; plus `GET /analytics/filter-options`.
All accept the shared filter query params (program, district, worker, date
range). Worker-level breakdowns require ADMIN.

## Administration — *ADMIN*

| Endpoint | Purpose |
|---|---|
| `GET /users` · `GET /users/roles` · `POST /users` · `PATCH /users/:id` · `POST /users/:id/reset-password` | User management (last-admin guardrail on disable/demote) |
| `GET /workflow/rules` · `POST /workflow/rules/:id` | Workflow rule list / update |
| `GET /scheduler/status` · `POST /scheduler/run` | Scheduler status + manual run |
| `GET /system-settings` | System settings summary |
| `POST /data-quality/duplicate-requests` (*Authenticated* — anyone can report) | Report a duplicate |
| `GET /data-quality/duplicate-requests` · `/:id/comparison` · `/:id/approve` · `/:id/reject` · `/:id/resolve` | Review workflow (resolve = MERGE or DELETE) |

## Errors

Failures return standard NestJS error JSON
(`{ statusCode, message, error }`); the frontend surfaces `message`
directly, so messages are written to be user-readable. `401` = missing or
expired token; `403` = role lacks the endpoint; `400` = validation.
