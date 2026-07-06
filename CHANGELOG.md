# Changelog

All notable changes to DiNC, summarized by milestone.

## [1.0.0-rc.1] — 2026-07-04 · Release Candidate 1

Production-polish wave (M35) on a feature-complete platform:

- **35A — Dead UI removal**: every rendered control is live; placeholders and
  fake affordances removed.
- **35B — Visual consistency**: shared styling patterns across all pages.
- **35C — Interaction polish**: shared dialog accessibility hook (Escape,
  focus trap, focus restore) on all 17 dialogs; skeleton loading states;
  double-submit guards on every async form; clickable Dashboard KPI
  drill-downs; uniform toast conventions (`role="status"`, error variant);
  meaningful empty states.
- **35D — Performance & production readiness**: memoized large tables;
  shared `lib/format.ts` (9 duplicate helpers consolidated); xlsx parser
  lazy-loaded (Guidebooks first-load JS 220 kB → 108 kB); dead files removed;
  zero unused code (strict tsc).
- **35E — Final QA (two passes)**: 10 defects fixed, including an open
  redirect in the consultation `returnUrl`, a stale-closure submit guard,
  untracked toast timers on five pages, and Citizens `?c=` selection not
  syncing on same-route navigation.
- **35F — RC1**: documentation set (README, INSTALLATION, DEPLOYMENT,
  ARCHITECTURE, DATABASE, API, release notes), `backend/.env.example`.

## [0.9.0] — 2026-07-03 · Stabilization

Full-codebase review; 12 fixes applied across error handling, cancellation,
and state consistency.

## Feature milestones

- **M34 — Analytics expansion**: Clinical Risk + Disease Analytics report
  tabs (`/analytics/risk`, `/analytics/diseases`) reusing alert semantics;
  LineChart primitive.
- **M33.1 — Workflow UX**: single consultation workspace application-wide
  (TeleconsultationWindow removed); clickable Action Centre with Resolved
  history; live filters on all list pages; Timeline/Guidebook → Consultation
  navigation.
- **M33 — Journey continuity**: manual enrollment stores the worker and
  auto-creates the first activity; escalation creates a SEVERE alert plus an
  URGENT follow-up; care-plan completion surfaced in toast and timeline.
- **M32 — Risk & Action Centre**: SEVERE-only alert feed (TopBar bell,
  Notifications page, Priority Alerts) from `clinical_alerts`; Dashboard
  risk KPI block.
- **M31 — Auto assignment**: activities scope to `enrollments.assigned_worker`;
  permission-scoped Worklist/Dashboard via `view.all` permissions.
- **M30 — Users & roles administration**: user CRUD, role assignment,
  password reset, last-admin guardrail.
- **M28 — Workflow Engine**: rules/events/audit engine (frozen contract in
  `docs/`); outcome-driven and scheduler-driven actions.
- **M27 — Workspace UX**: single-viewport clinical workspace primitives
  (Workspace, Panel, KPI ribbon), modernized shell, collapsible sidebar;
  Dashboard, Citizens and Users rebuilt on them.
- **M26 — Administration & dev user switching.**
- **M25 / M25A — CDSE**: category-based risk classification
  (NONE/LOW/MODERATE/SEVERE), `clinical_alerts`, structured
  `consultation_responses` with immutable `item_key` identity.
- **M20B — Dashboard Studio**: plugin-based dashboard layouts persisted
  per role.
- **M16–M18 — Consultation & counselling**: normalized counselling model
  (15 protocols / 101 sections / 424 items seeded), consultation workspace,
  documentation engine, clinical journey.
- **M12 / M11B — Integrated patient registration** with duplicate detection
  and bulk upload.
- **M9 — Dashboard redesign & data-quality workflow** (duplicate
  report/review/merge).
- **M5–M8 — Programs, enrollment, activities, worklist** read/write layers
  and data-integrity hardening.
- **M1–M3 — Foundation**: monorepo, JWT authentication against
  `public.users`, application shell, worklist visual framework.
