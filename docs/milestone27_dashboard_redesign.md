# Milestone 27 — Dashboard Redesign (density-first, reference implementation)

**Status:** Design only. No code. **Part of the M27 workspace redesign** (not a new
milestone). Dashboard scope only. The finalized Dashboard becomes the **visual reference for
every other DiNC page**, so it is finalized first before any other page is touched.

**Primary reference:** `Reference/UI reference.png` — adopt its **layout, density, spacing,
hierarchy, and workspace organization**; never its branding, colours, fonts, or identity.
DiNC keeps its green palette, icons, and names.

**Objective:** one-glance understanding of system + operational state at **1920×1080** with
minimal scrolling. Not "the old dashboard, smaller" — every widget is challenged; redundant
ones merge; supporting data moves to the inspector; horizontal space replaces vertical
stacking. **No data or feature is removed.**

---

## Part 1 — Governing principle: every panel must justify its existence
Before any widget gets a dedicated panel, ask, in order:
1. Can it join the **KPI Ribbon**? 2. Can it **merge** with another panel? 3. Can it be a
**tab**? 4. Can it be a **chip / inline summary**? 5. Does it *truly* deserve dedicated
screen space? Only two panels survive this test on the Dashboard: **Today's Worklist**
(primary) and the **Inspector** (stacked sections). Everything else becomes the ribbon,
header chips, header actions, or inspector sections.

---

## Part 2 — Region model (four regions)
```
Header band   → title + subtitle + Quick Actions (operational only)   [no search]
KPI Ribbon    → system-health metrics, one fixed non-scrolling band
Primary       → Today's Worklist (65–70% width)
Inspector     → Priority Alerts · Recent Activity · Programme Summary · CPHC Services (30–35%)
```
Grid: **`ribbon+primary-inspector`** (WorkspaceGrid). Fixed: header, ribbon, panel headers,
inspector section headers. Scrolls: the worklist table body, the Recent Activity feed, and
(if long) the Priority Alerts list — all inside `PanelContent`. No page scroll.

---

## Part 3 — Wireframe (1920×1080; sidebar may be expanded or collapsed — ribbon fits either)
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Dashboard   Operations command centre · live system summary        [+ New Patient] [Bulk Upload] │ 52  header
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ KPI RIBBON — SYSTEM HEALTH (fits width exactly; NEVER scrolls)                              │
│ ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐                     │
│ │👥 1,240 ││📋 860   ││🗂 15    ││📚 424   ││🩺 8     ││🔔 3     ││⏱ 57    │                     │ 64
│ │Patients ││Enroll.  ││Programs ││Knowledge││Services ││Alerts   ││Tasks    │                     │
│ │         ││920 tot  ││12 sub   ││ assets  ││         ││         ││9 overdue│                     │
│ └────────┘└────────┘└────────┘└────────┘└────────┘└────────┘└────────┘                     │
├──────────────────────────────────────────────────────────────┬───────────────────────────┤
│ 📋 Today's Worklist                                 [density ⋯]│ 🚨 Priority Alerts        │
│ Completed 12 · Pending 23 · Overdue 35 · Referred 4 ·          │  ● SEVERE  Priya K. — HTN │
│ No Answer 6 · Emergency 2            (worklist outcome chips)  │  ◈ MOD     Ravi D. — DM ▸ │
│ ──────────────────────────────────────────────────────────── │ ───────────────────────── │
│ UHID      Program        Activity        Due    Status   ⋮   │ 🕑 Recent Activity        │
│ ──────────────────────────────────────────────────────────── │  ● CHF-001 BP logged…     │
│ UH-0001   Cardiac F/U    Monthly BP Rev  04-01  ●Over [G C O ⚠]│    Priya Kumar · 10m   ▸ │
│  ENR-0001 (sub-line)                                          │ ───────────────────────── │
│ UH-0001   Diabetes Mgmt  HbA1c           04-15  ●Over  …      │ ⚙ Programme Summary       │
│ …dense 32px rows · sortable headers · internal scroll ▸       │  Cardiac 1 · Diabetes 2 ▸ │
│                                                               │ ───────────────────────── │
│                                        ‹ 1  2  3 ›  (real)    │ 🩺 CPHC Services          │
│                                                               │  Repro&Child 7·6OV …   ▸  │
└──────────────────────────────────────────────────────────────┴───────────────────────────┘
   primary ~66% (table scrolls)                                   inspector ~34% (stacked)
```
*(Values illustrative; every number comes from the same API fields used today.)*

---

## Part 4 — Region details

### 4.1 Header band (no search)
- Title `Dashboard`, one-line subtitle `Operations command centre · live system summary`
  (via the approved `WorkspaceHeader.subtitle`).
- Actions = **Quick Actions**, operational only: **New Patient**, **Bulk Upload**
  (PatientActions with `includeNavShortcuts={false}`). No Guidebooks/Reports/Admin — those
  live in the sidebar; no duplication.
- **No global search box.** Global search is deferred to a future milestone.

> Note: PatientActions today exposes **New Patient** (the citizen registration wizard) and
> **Bulk Upload**. "New Patient" *is* citizen registration; if a separately-labelled
> "Register Citizen" entry is wanted, that is a small future addition, not a current feature.

### 4.2 KPI Ribbon — system health only, never scrolls
- **Content = overall system health** (NOT worklist metrics): Patients, Active Enrollments,
  Programmes, Knowledge Assets, CPHC Services, Pending Alerts, Pending Tasks.
- **Never horizontal-scrolls.** Cards are `flex: 1 1 0; min-width: 0` so N cards always
  divide the available width. If width per card gets tight, the **card design adapts**
  (icon moves inline-left, value + label condense) instead of scrolling — the ribbon is one
  fixed band that always fits 1664–1860px.
- No per-metric frames; each card is `icon · value · label` with an optional **hint**
  sub-value.
- Refines the `KpiRibbon` primitive (contract C.9): add a **fit/no-scroll mode** (default for
  the Dashboard) alongside the existing overflow-scroll behaviour — backward compatible.

### 4.3 Primary — Today's Worklist (65–70% width)
- The Dashboard's focus. `Panel` → `PanelHeader` (title + **worklist outcome chips**:
  Completed · Pending · Overdue · Referred · No Answer · Emergency — all six, in the panel
  header, **not** the ribbon) → `PanelContent` with a dense **DataTable**.
- Table: UHID (+ENR sub-line) · Program · Activity · Due · Status pill · **row actions**
  (Guide 📖 · Call 📞 · Open 👁 · Report Duplicate ⚠). Sortable headers. Real pagination.
- Requires the `DataTable` primitive (contract C.8).

### 4.4 Inspector — reordered: critical → summary (30–35% width)
Stacked sections, in this exact order so operational urgency is seen first:
1. **🚨 Priority Alerts** — top active clinical alerts (SEVERE/MODERATE) via the **existing**
   `fetchActiveAlerts` API (already used by the TopBar bell + Notifications page — **no new
   endpoint**). Each row: severity pill · citizen · condition; click → open consultation /
   Notifications. Scrolls if long.
2. **🕑 Recent Activity** — `recentActivity[]` feed (icon · title · subtitle · relative time).
3. **⚙ Programme Summary** — `programs[]` as name + active-enrolment count chips.
4. **🩺 CPHC Services** — `services[]` tiles (colour dot/icon · name, + totals if present).

---

## Part 5 — Dashboard Studio: preserved in full, region-aware internally
Studio keeps **every** capability — drag-reorder, show/hide, add via Library, remove, reset,
role selector, **save-layout-per-role**, edit mode. Internal adaptation only:
- Layout model gains a **region** (`ribbon` | `primary` | `inspector`) per widget instead of
  a flat 3-column `colSpan`. Edit-mode operations run **within a region** (reorder inside a
  region; move between regions). The edit toolbar/overlay is unchanged to the user.
- **Legacy widgets are NOT removed.** `kpi-cards`, `stat-*`, `programs`, `services`,
  `activity`, `worklist`, `quick-actions` all remain **registered and in the Widget Library**
  for backward compatibility and existing saved layouts. They are **mapped into regions**:
  stat/KPI widgets → ribbon, `worklist` → primary, `programs`/`services`/`activity` → inspector.
- **New default layout** uses new region widgets: a single **KPI Ribbon** widget (ribbon),
  the **Worklist** widget (primary), and **Priority Alerts / Recent Activity / Programme
  Summary / CPHC Services** (inspector). A migration maps any existing saved role layout onto
  regions (by widget type) so no stored layout breaks.
- The KPI Ribbon widget's **individual metric cards are toggleable**, preserving the
  metric-level configurability the five separate `stat-*` widgets used to provide — without
  five frames.

Users see the same Studio; they simply configure three regions instead of a 3-column grid.

---

## Part 6 — Nothing lost (mapping + preservation)

**Widget → region:**
| Current widget | New home |
|---|---|
| `kpi-cards`, `stat-citizens/enrollments/programs/tasks/overdue` | **KPI Ribbon** (system-health cards + hints); legacy widgets stay in Library |
| `worklist` (table) | **Primary** DataTable (all columns + all 4 row actions) |
| `worklist` (6-stat strip) | **Primary panel header** outcome chips (all 6) |
| `programs` | **Inspector › Programme Summary** |
| `services` | **Inspector › CPHC Services** |
| `activity` | **Inspector › Recent Activity** |
| `quick-actions` | **Header** actions (New Patient + Bulk Upload; nav shortcuts off) |
| *(new)* Priority Alerts | **Inspector › Priority Alerts** via existing `fetchActiveAlerts` |

**Every metric's home:** registeredCitizens→Patients · activeEnrollments(+totalEnrollments
hint)→Enrollments · programs(+subPrograms hint)→Programmes · knowledgeAssets→Knowledge ·
cphcServices→Services · pendingNotifications→Alerts · pendingTasks(+overdueTasks hint)→Tasks ·
worklist.completedToday/pending/overdue/referred/noAnswer/emergencyReferrals→worklist header
chips · programs[]→Programme Summary · services[]→CPHC Services · recentActivity[]→Recent
Activity · worklistItems[]→primary table.

**Functionality checklist:** ✅ worklist columns/sort/pagination · ✅ Guide/Call/Open/Report
Duplicate row actions · ✅ Teleconsultation + Report Duplicate dialogs + toast · ✅ Quick
Actions (New Patient, Bulk Upload) · ✅ Studio drag/region/show-hide/add/remove/reset/**save
per role**/role selector/edit mode · ✅ all 16 metrics visible · ✅ Programme Summary, CPHC
Services, Recent Activity · ✅ permissions (`dashboard.edit`), routing, backend APIs unchanged
· ✅ one `Workspace`, only panel content scrolls. **Removed only:** the disabled global search
box (deferred, by decision) and duplicated KPI frames (metrics retained).

---

## Part 7 — Dependencies & sequencing (gated on approval)
**Primitives to build first (dormant, one commit each, build-green — M27 discipline):**
`KpiRibbon` (C.9, with the new fit/no-scroll mode) and `DataTable` (C.8). Inspector sections
reuse `Panel`/`PanelHeader`/`PanelContent`. The Studio region model is a Studio-internal
change.

**Then:** rebuild the Dashboard on the four regions (one commit), preserving Studio + every
widget + every metric; build green; only panel content scrolls; stop for approval.

**APIs:** reuse only — `fetchAdminDashboard`, `fetchWorklistOverview`, and the existing
`fetchActiveAlerts` (Priority Alerts). No new backend endpoints.

*End of Dashboard redesign (M27). Design only; no code written. Awaiting approval before
implementation.*
