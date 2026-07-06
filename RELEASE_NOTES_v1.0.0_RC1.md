# DiNC v1.0.0 — Release Candidate 1

**Date:** 2026-07-04
**Status:** Release Candidate — pending the manual smoke test below before
the final v1.0.0 tag.

## Major features

- **Complete clinical loop** — register a citizen (single or CSV/Excel bulk,
  with duplicate detection), enroll them in a program (worker assigned,
  first activity auto-created), work the activity from the permission-scoped
  Worklist or Dashboard, run the consultation (call lifecycle, seeded
  counselling protocols, auto-generated documentation with draft autosave),
  save an outcome — which classifies risk (CDSE), raises alerts, and fires
  workflow rules that schedule the next activity.
- **Clinical decision support (CDSE)** — 4-level risk classification from
  structured consultation responses; SEVERE alerts flow to a single Action
  Centre (bell, Notifications page, Priority Alerts) backed by one SQL
  predicate; care-plan goal suggestions with accept/reject audit.
- **Workflow Engine** — administrator-editable rules that create,
  reschedule, and escalate activities on outcomes and on schedule (in-app
  scheduler with run log and manual trigger).
- **Data-driven guidebooks** — live-composed from JSONB sections plus
  counselling protocols; JSON import, bulk upload, version history, branded
  PDF export.
- **Reports & analytics** — 11 report tabs aggregating the live operational
  tables (so reports always agree with the screens), with shared filters and
  role-scoped worker breakdowns.
- **Administration** — users & roles (last-admin guardrail), workflow rules,
  scheduler, system settings, data-quality duplicate workflow
  (report → review → merge/delete).
- **Production polish (M35 A–F)** — uniform dialogs/toasts/skeletons/empty
  states, full keyboard accessibility on dialogs, double-submit protection on
  every form, clickable KPI drill-downs, memoized large tables, lazy-loaded
  heavy dependencies, two-pass QA with 10 defects fixed.

## Roles

`ADMIN` (full access), `CLINICIAN` and `ANM` (worklist, citizens, reports —
scoped to assignments), `CARE_ASSISTANT` (worklist and citizens only).

## Tested workflows

Verified by code-level QA (Waves 35E passes 1–2) and continuous builds:

- Registration → enrollment → first activity → worklist → consultation →
  outcome → workflow follow-up → alert → analytics (full hand-off trace).
- Guidebooks: import validation, bulk upload, version history, PDF download,
  search/filter, deep links (`?g=`, `?activity=`).
- Administration: user lifecycle, rule editing, scheduler runs, duplicate
  resolution.
- Role gating: navigation, page guards, and backend scoping agree for all
  four roles.
- Session expiry: invalid/expired tokens clear the session and return to
  login; in-flight failures surface readable errors.
- Builds: frontend production build (19 routes), frontend strict
  type-check (zero unused code), backend type-check — all clean.

> **Before tagging v1.0.0:** run the manual smoke test in DEPLOYMENT.md §6
> with a live database — code-level QA cannot replace one real click-through
> per role.

## Known limitations

- **CORS origins are hardcoded** in `backend/src/main.ts`; deployments to a
  real domain must add their origin there (see DEPLOYMENT.md).
- **No refresh tokens** — sessions end at JWT expiry (`JWT_EXPIRES_IN`).
- **Single-instance scheduler** — running multiple API instances duplicates
  the sweep; designate one scheduling instance.
- **Desktop-first UI** — tested for desktop/laptop widths; sub-tablet
  layouts are out of scope for v1.0.
- **Reports tab state** — deep links (`/reports?tab=risk`) work; switching
  tabs does not update the URL.
- **No automated test suite** — quality is held by strict TypeScript,
  build gates, and manual QA; adding tests is the top post-1.0 engineering
  recommendation.
- Guest mode is a navigation demo only (no data access).

## Upgrade notes

- Fresh installs: follow INSTALLATION.md (env files, seed scripts in order).
- From v0.9.0: no schema or API changes — module tables self-create, seeds
  unchanged. Rebuild both apps (`npm run build`). New file
  `backend/.env.example`; no new environment variables.
- No data migrations are required for any 0.x → 1.0.0-rc.1 upgrade path.
