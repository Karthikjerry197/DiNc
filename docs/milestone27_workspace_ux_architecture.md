# Milestone 27 — Workspace UI/UX Architecture

**Type:** Design & architecture only. No code in this milestone.
**Status:** Approved design direction incorporated (v2). Implementation begins only after final approval.
**Author:** Prepared from a direct audit of the current `frontend/` source and the approved UI reference.

> **Governing rule of this milestone:** DiNC is a **desktop clinical application, not
> a scrolling website.** Every major page fills the viewport; only individual panels
> or tables scroll. The newest pages (Consultation, Citizens, Guidebooks) already
> point this way — the plan **systematizes** that model across every module using a
> single set of reusable workspace primitives and the approved visual reference as
> the benchmark.

---

## 0. Visual Reference & Governing Design Direction

### 0.1 The reference image (project visual benchmark)
`C:\Users\TMDL DiNC Assam\Desktop\New method\Reference\UI reference.png`

This screenshot is the **project's visual benchmark** for workspace organization,
panel sizing, table density, spacing, and overall UX. **Whenever any layout,
density, or panel-arrangement question is ambiguous during implementation, defer to
this image before deciding.**

**Adopt** its *workspace philosophy and layout principles*.
**Do NOT copy** its branding, colors, icons, product name, or product identity —
DiNC keeps its own brand (the green `--p` palette, the DiNC identity, the health
iconography). Only the *structure and density* are the reference.

### 0.2 What the reference demonstrates (workspace anatomy)
The reference is a single-viewport clinical dashboard with **no page scroll**,
composed exactly of the primitives approved for DiNC:

```
┌ Sidebar (fixed, ~200px) ┬ WorkspaceHeader (title · search · account/logout) ────────┐
│ ⊞  brand                │                                                            │
│ ▣ Dashboard (active)    ├ WorkspaceGrid ─────────────────────────────────────────── │
│ ▤ Worklist        (35)  │ ┌ KPI ribbon (one dense row, pinned) ───────────────────┐ │
│ 👤 Patients             │ │ 58 Activities │35 Overdue│23 Pending│0 Done│2 Due│6…  │ │
│ 📘 Guidebook            │ └────────────────────────────────────────────────────────┘ │
│ 🎓 Training             │ ┌ Primary Panel (table) ──────────┐ ┌ InspectorPanel ────┐ │
│ ❔ FAQ                  │ │ PanelHeader: "Follow-up          │ │ BY PROGRAM (chips) │ │
│ ✅ Reviews         (3)  │ │  Essentials"  [+ New Patient]    │ │ ───────────────────│ │
│ 🚑 Emergency            │ │ PanelContent: DataTable          │ │ CPHC Services grid │ │
│ ⚙ Admin                │ │  UHID│PROGRAM│ACTIVITY│DUE│…     │ │ ───────────────────│ │
│                         │ │  ▸ sortable headers, status      │ │ Recent Activity    │ │
│ 👤 Admin User (footer)  │ │    pills, inline row actions     │ │  feed              │ │
└─────────────────────────┴ └──────────────────────────────────┘ └────────────────────┘ │
```

Concrete lessons taken from it (all **structure**, no brand):
1. **One screen, no page scroll.** KPI ribbon + workspace grid + table + inspector
   all fit the viewport; the table alone scrolls internally when rows overflow.
2. **KPI ribbon.** A single, dense, non-wrapping row of compact stat cards
   (icon · big number · label) pinned under the header.
3. **Table is the primary workspace.** The dominant left region is a dense,
   sortable `DataTable` with sub-line cells (`UH-2025-001` / `ENR-0001`), status
   pills (`Overdue`), and **inline row actions** (Guide · Call · icon).
4. **Inspector rail, not separate pages.** Supporting context (program grouping
   chips, services grid, recent-activity feed) sits in an adjacent stacked
   `InspectorPanel`, not on another route.
5. **Panels self-describe.** Each panel has a `PanelHeader` (title + subtitle +
   optional action, e.g. `[+ New Patient]`) over its `PanelContent`.
6. **Density over decoration.** Tight rows, small cards, chips, minimal whitespace —
   optimized for long clinical shifts, yet clean and readable.
7. **Sidebar with collapse affordance, count badges, and a user footer.**

### 0.3 Approved design principles (govern every module)
1. **Desktop clinical application, not a scrolling website.**
2. **Eliminate browser/page scrolling wherever practical.** Every major page fits
   the viewport; where scrolling is unavoidable, only individual **panels or
   tables** scroll internally.
3. **Every page uses a fixed workspace layout:** fixed header · collapsible
   sidebar · fixed workspace area · independent scrollable panels.
4. **One screen = one task.** Users should rarely scroll to complete work.
5. **Information density over decorative whitespace** — clean and readable, tuned
   for healthcare workers on long shifts.
6. **Tables are the primary workspace for list-based modules** (Citizens, Worklist,
   Reports, Notifications, …), with supporting information in **adjacent panels
   instead of separate pages** wherever possible.
7. **Reusable workspace primitives, used consistently everywhere:** `Workspace`,
   `WorkspaceHeader`, `WorkspaceGrid`, `Panel`, `PanelHeader`, `PanelContent`,
   `InspectorPanel`.
8. **Every module** — Dashboard, Citizens, Consultation, Care Plans, Knowledge,
   Administration, Reports, Programs, Diseases, Guidebooks, and all future modules —
   **follows the same workspace architecture.**
9. **Maximize usable screen space** while maintaining consistency across all pages.
10. **On any uncertainty during implementation, consult the reference image first**
    — it is the visual benchmark for workspace organization, panel sizing, table
    density, and UX.

---

## 1. Executive Summary

DiNC already has the *skeleton* of this architecture: a fixed shell
(`.shell { height:100vh; overflow:hidden }`), a permanent sidebar and top bar, and a
content region. Three of the newest pages already implement true fixed-height,
panel-scrolling workspaces. The work of M27 is **consistency and completion**, not a
ground-up redesign — bringing every page to the reference's single-viewport,
table-primary, inspector-panel model through shared primitives.

Current gaps (grounded in the source):

1. **Two classes of page coexist.** "Workspace" pages (Consultation, Citizens,
   Guidebooks) pin to the viewport with `height: calc(100vh − Npx)` and scroll
   individual panels. "Document" pages (Dashboard, Worklist, Reports, Notifications,
   Administration, Knowledge) render a plain `.page` that grows unbounded, so the
   whole content area scrolls. **Every page must become a `Workspace`.**
2. **Fragile viewport math.** Workspace pages hardcode the header offset —
   `calc(100vh − 102px)` (Citizens), `− 130px` (Consultation), `− 196px`
   (Guidebooks) — which must be hand-tuned and already disagree. A single
   `Workspace`/`WorkspaceGrid` primitive owns this centrally.
3. **Workspaces undermined by trailing content.** Citizens renders `PatientTimeline`
   *below* its fixed `cz-workspace` grid, reintroducing whole-page scroll.
4. **Multi-panel single-scroll columns.** Consultation's `.cw-note-col` stacks four
   unrelated panels into one scroll instead of independent panels/inspector tabs.
5. **List pages are not table-primary.** Worklist/Notifications/Reports do not yet
   follow the reference's "dense table + inspector" model.
6. **No design-token scale.** `:root` defines colors + a font only. **No spacing,
   type, radius, shadow, or z scale.** One 7,444-line `globals.css` with **462
   hardcoded `font-size` values** (many 8.5–11px). Density is achieved by shrinking
   text rather than by a system.
7. **Non-adaptive sidebar.** `.shell-sidebar` is a fixed 224px column — no
   collapsed/expanded/hover states (the reference shows a collapse affordance).
8. **Scattered breakpoints** at 520/600/700/720/760/900/1024/1100px, no shared
   system.

---

## 2. Current Foundation — What Exists Today

### 2.1 Application shell (`components/shell/AppShell.tsx`)
```
.shell (flex, 100vh, overflow:hidden)
├── .shell-sidebar        224px fixed, no collapse
└── .shell-main (flex col, min-width:0)
    ├── .shell-topbar     58px fixed
    └── .shell-content    flex:1; overflow-y:auto; padding:22px 26px   ← the one scroll region
```
The shell is already "fixed." The `Workspace` primitive will fill `.shell-content`
exactly so page content stops scrolling as a block.

### 2.2 Design tokens (`app/globals.css :root`)
Present: `--p/--ps/--pl` (primary greens — **retained; DiNC brand**), `--bg`,
`--card`, `--bd`, `--tp/--ts`, `--er`, `--font`.
**Absent:** spacing, type, radius, shadow, z-index scales; semantic surface/state
colors. Consequence: 462 hardcoded font sizes and ad-hoc spacing.

### 2.3 Scrolling model — two patterns (to be unified)
| Pattern | Pages | Mechanism |
|---|---|---|
| **Workspace (target)** | Consultation, Citizens, Guidebooks | `height: calc(100vh − Npx)` + grid/flex + inner `overflow` |
| **Document (legacy)** | Dashboard, Worklist, Reports, Notifications, Administration, Knowledge | plain `.page`; whole content area scrolls |

### 2.4 Sidebar & header
- Sidebar: static 224px; brand + 8 nav items + logout; no collapse/tooltips/sub-nav.
- Top bar: 58px; a **disabled** search input; notification bell (60s poll); account
  menu (dev user switch). The reference validates the header shape (title · search ·
  account) — DiNC's search should become functional or be removed until built.

---

## 3. Approved Principles → Concrete Mechanisms

| # | Approved principle | Mechanism in this design |
|---|---|---|
| 1 | Desktop app, not a website | Every page is a `Workspace` filling the viewport |
| 2 | Eliminate page scroll | Only `PanelContent`/`DataTable` scroll; body/page never scroll |
| 3 | Fixed workspace layout | Fixed header + collapsible sidebar + `WorkspaceGrid` + independent `Panel`s |
| 4 | One screen = one task | Primary panel + `InspectorPanel` keep the task on one screen |
| 5 | Density over whitespace | Token-driven compact density; reference-matched row/card sizing |
| 6 | Tables primary for lists | `DataTable` primary panel + `InspectorPanel` beside it (no separate pages) |
| 7 | Reusable primitives | The 7 approved primitives, used by every module |
| 8 | Same architecture everywhere | One template family; no bespoke page shells |
| 9 | Maximize usable space | Collapsible sidebar + no page chrome waste + dense grid |
| 10 | Reference as benchmark | Ambiguities resolved against `UI reference.png` |

---

## 4. Global Recommendations

### 4.1 Canonical workspace primitives (the approved set)
These seven are the **only** layout concepts. Every page composes them; no page
invents its own shell.

| Primitive | Responsibility |
|---|---|
| **`Workspace`** | Fixed, viewport-filling root of a page. Fills the shell exactly and owns the height math — **retires every per-page `calc(100vh − Npx)`.** Never scrolls. |
| **`WorkspaceHeader`** | Fixed page header inside the workspace: title · breadcrumb/context · global search · primary actions/account. Replaces bespoke `cw-breadcrumb`, page-head variants. |
| **`WorkspaceGrid`** | The fixed grid arranging panels — e.g. a KPI-ribbon row over a `[primary | inspector]` split, or a `[list | detail]` split. Owns column/row templates and responsive collapse. |
| **`Panel`** | A self-contained region that owns **its own** scroll. The unit of layout. |
| **`PanelHeader`** | Sticky panel title + subtitle + panel-level actions (e.g. `[+ New Patient]`, density toggle). |
| **`PanelContent`** | The panel's scroll region — **the only place scrolling happens.** |
| **`InspectorPanel`** | A specialized right-hand `Panel` for contextual/supporting info adjacent to the primary panel (details, grouping, related feeds). Embodies "adjacent panel, not a separate page." |

**Supporting components** (compositions of the above — not new layout concepts):
- **`DataTable`** — a table rendered in `PanelContent`: sticky sortable header,
  density modes, sub-line cells, status pills, inline row actions, real
  pagination/virtualization. Modeled on the reference table.
- **`KpiRibbon`** — a `WorkspaceGrid` row of compact stat `Panel`s (the reference's
  metric strip); one dense non-wrapping row.
- **`StickyActionBar`** — a pinned action row (Save/Complete) at a `Panel`/
  `Workspace` footer; always visible.
- **`SplitPane`** — a resizable split used inside a `WorkspaceGrid` cell (e.g.
  Consultation), with a drag handle + persisted sizes.
- **`Tabs`** — one in-panel tab system replacing `cz-tab-bar`/`rp-tabs`/`kh-tabs`/
  `GuidebookTabs`.

### 4.2 Application shell redesign
```
┌ TopBar (fixed, --shell-header-h) ─────────────────────────────────────┐
├──────────┬────────────────────────────────────────────────────────────┤
│ Sidebar  │  Workspace (fills remaining height exactly; never scrolls)  │
│ (--sb-w) │  ┌ WorkspaceHeader (title · search · actions) ───────────┐  │
│          │  ├ WorkspaceGrid ──────────────────────────────────────── │  │
│          │  │  Panels (each: PanelHeader + PanelContent[scroll])    │  │
│          │  │  + optional InspectorPanel + StickyActionBar          │  │
│          │  └───────────────────────────────────────────────────────┘  │
└──────────┴────────────────────────────────────────────────────────────┘
```
`--shell-header-h` and `--sb-w` are CSS variables; height flows via flexbox from the
shell down (`height:100%`), never per-page `100vh` math. Legacy `.page` pages keep
working until migrated (backward compatible).

### 4.3 Sidebar redesign — expanded / collapsed / hover (reference has a collapse toggle)
```
 EXPANDED (224px)          COLLAPSED (~60px)       HOVER (over collapsed → 224px)
┌──────────────────┐      ┌────┐                  ┌──────────────────┐
│ 🏥 DiNC          │      │ 🏥 │                  │ 🏥 DiNC          │ (overlay; does
│ ▦  Dashboard     │      │ ▦  │  tooltip:        │ ▦  Dashboard     │  not reflow the
│ ☑  My Worklist(35)│     │ ☑ ⁵│  "My Worklist"   │ ☑  My Worklist   │  workspace)
│ 👥 Citizens      │      │ 👥 │                  │ 👥 Citizens      │
│ …                │      │ …  │                  │ …                │
│ 👤 Admin User    │      │ 👤 │                  │ 👤 Admin User    │
└──────────────────┘      └────┘                  └──────────────────┘
```
- Toggle in the sidebar (reference shows the ⊞ affordance top-left) + `[` shortcut;
  state persisted to `localStorage`.
- Count badges on nav items (reference: Worklist 35, Reviews 3) — DiNC can surface
  worklist/alert counts the same way.
- Collapsed = icons + tooltips; hover expands as an overlay so the workspace never
  reflows. Room for grouped sub-nav later (Administration → Programs/Diseases/…).

### 4.4 Header redesign
- Zones: title/breadcrumb · center search · account cluster (matches the reference).
- Replace the dead disabled search with a working global search / `⌘K`, or remove
  until built.
- `WorkspaceHeader` owns the title + context strip so pages stop rolling their own.

### 4.5 Typography system
Replace 462 hardcoded sizes with a fixed rem-based scale (16px root):
```
--fs-2xs:11  --fs-xs:12  --fs-sm:13  --fs-md:14(base)  --fs-lg:16  --fs-xl:20  --fs-2xl:24  --fs-3xl:30
--lh-tight:1.25  --lh-normal:1.45  --fw-regular:400 --fw-medium:500 --fw-semibold:600 --fw-bold:700
```
Density comes from spacing, not sub-11px text. **Minimum body/label = 12px**; retire
the 8.5–10px labels. Map existing classes to tokens during migration (no big bang).

### 4.6 Spacing system (4px base)
```
--sp-1:4  --sp-2:8  --sp-3:12  --sp-4:16  --sp-5:20  --sp-6:24  --sp-8:32
```
A single `--density` switch (comfortable / compact) scales panel padding for
large-monitor vs laptop. Default leans **compact** to match the reference density.

### 4.7 Card / panel system
One `Panel` primitive replaces the bespoke card treatments (`dash-*`, `cw-*`,
`gb-*`, `notif-*`, `rp-*`):
```
┌ Panel ──────────────────────────────┐
│ PanelHeader  title · subtitle · [action]   ← sticky within panel
├─────────────────────────────────────┤
│ PanelContent  (overflow:auto)              ← the ONLY scroll in the panel
├─────────────────────────────────────┤
│ StickyActionBar (optional)                 ← always visible
└─────────────────────────────────────┘
```
Tokens: `--radius-md:10px`, `--shadow-sm/md`, `--bd`. Variants: `default`,
`flush` (tables), `subtle` (nested/inspector).

### 4.8 Table density (tables are the primary workspace)
`DataTable`, modeled on the reference table:
- Sticky sortable header; body scrolls inside its panel; the page never scrolls.
- **Sub-line cells** (e.g. `UH-2025-001` over `ENR-0001`), **status pills**
  (`Overdue`/`Due`/risk levels), and **inline row actions** (Guide · Call · open).
- Density modes: comfortable (40px) / **compact (32px, default)** / dense (28px),
  persisted.
- Real pagination or virtualization (Worklist's current `‹ 1 ›` is a
  **non-functional placeholder** — replace).
- Row selection drives the adjacent `InspectorPanel` (detail without navigation).

### 4.9 Responsive breakpoints (one scale)
```
--bp-sm:640  --bp-md:768  --bp-lg:1024  --bp-xl:1280  --bp-2xl:1536
```
Workflows never change — only layout:
- **≥1536:** full density; inspector always visible; optional 3–4 columns.
- **1024–1535 (default laptop/desktop):** table-primary + inspector; sidebar often
  collapsed.
- **768–1023:** inspector collapses to a drawer/toggle; sidebar = icons.
- **<768:** single column; sidebar = overlay drawer.

---

## 5. Per-Page Audit

> Each page: **(1)** current layout · **(2)** problems · **(3)** proposed workspace ·
> **(4)** panel arrangement · **(5)** scrolling · **(6)** navigation · **(7)**
> complexity (**S** ≤1d · **M** 2–3d · **L** 4–6d · **XL** >6d) · **(8)** wireframe.
> Every proposal uses the canonical primitives; list modules are **table-primary +
> `InspectorPanel`**. On any layout ambiguity, match `UI reference.png`.

### 5.1 Dashboard (`/dashboard`) — the reference exemplar
1. **Current:** Widget grid (`DashboardStudio`/`AdminDashboard` + registry) inside a
   plain `.page`; grows and scrolls.
2. **Problems:** KPIs and widget canvas scroll together; actionable content pushed
   below the fold; no fixed at-a-glance zone; does not match the reference.
3. **Proposed:** Mirror the reference exactly — `KpiRibbon` (pinned) over a
   `WorkspaceGrid` of `[ primary table Panel | InspectorPanel ]`.
4. **Panels:** `KpiRibbon` (Activities/Overdue/Pending/Completed/Due/Patients/…);
   Primary `Panel` = "Follow-up Essentials" `DataTable`; `InspectorPanel` = By
   Program chips + CPHC Services grid + Recent Activity feed.
5. **Scrolling:** Only the table body and the inspector feed scroll; ribbon + header
   pinned; page fixed.
6. **Navigation:** Row actions (Guide/Call/Open); Studio edit mode retained; density
   toggle; widgets deep-link.
7. **Complexity:** **M** (widget system already modular; reshape into ribbon +
   table + inspector).
8. **Wireframe:**
```
┌ Dashboard ─────────────── 🔎 Search UHID, patient, activity…    Admin · Logout ┐
│ 58 Activities │ 35 Overdue │ 23 Pending │ 0 Done │ 2 Due │ 6 Patients │ 3 Rev  │ ← KpiRibbon
│ ┌ Follow-up Essentials ───────────── [+ New Patient] ┐ ┌ Inspector ──────────┐ │
│ │ UHID        PROGRAM      ACTIVITY   DUE   STATUS ⚙ │ │ BY PROGRAM          │ │
│ │ UH-2025-001 Cardiac f/u  BP Review  4-01  ●Overdue │ │ [Cardiac 1][DM 2]…  │ │
│ │  ENR-0001                          [Guide][Call]   │ │ ─────────────────── │ │
│ │ UH-2025-002 Diabetes     HbA1c      4-15  ●Overdue │ │ CPHC Services grid  │ │
│ │ …                                                  │ │ ─────────────────── │ │
│ │           (table body scrolls)                     │ │ Recent Activity ↓   │ │
│ └────────────────────────────────────────────────────┘ └─────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 My Worklist (`/worklist`)
1. **Current:** `.wl-page` toolbar/filters + `WorklistTable`; **placeholder**
   pagination; document scroll.
2. **Problems:** Table scrolls with the page; header row lost; pagination fake;
   filters eat vertical space; no inspector.
3. **Proposed:** Table-primary workspace — filter bar in `WorkspaceHeader`/panel,
   `DataTable` primary, `InspectorPanel` for the selected activity (patient, due,
   guide, quick actions) — no separate detail page.
4. **Panels:** Primary `DataTable` (Citizen · Activity · Due · Priority · Status ·
   Actions); `InspectorPanel` = selected-row detail + Guide/Call/Open.
5. **Scrolling:** Table body only; header + filters + inspector pinned.
6. **Navigation:** Row → inspector; "Open" → Consultation; real pagination/virtual;
   saved filter presets.
7. **Complexity:** **M**.
8. **Wireframe:**
```
┌ My Worklist ── [Program ▾][Status ▾][Priority ▾][Due ▾]  [Density]  🔎 ─────────┐
│ ┌ Activities (DataTable) ─────────────────────┐ ┌ Inspector: selected row ────┐ │
│ │ Citizen    Activity   Due    Prio  Status ▸ │ │ Ram Kumar · UH-00123        │ │
│ │ Ram K.     HTN f/u    Today  HIGH  ●Due   ◄ │ │ HTN follow-up · due Today   │ │
│ │ Asha D.    ANC-2      Tue    MED   ○Pend    │ │ [Guide] [Call] [Open →]     │ │
│ │ …  (body scrolls)                           │ │ Last visit: 12 Jun · LOW    │ │
│ └───────────────  1–50 of 214  ‹ 1 2 3 › ─────┘ └─────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Citizen List + 5.4 Citizen Profile (`/citizens`)
1. **Current:** 3-column workspace `cz-workspace (272px | 1fr | 360px)` at
   `calc(100vh − 102px)` — good — **but** `<PatientTimeline>` renders *below* it and
   a `cz-tab-bar` sits above, so the page still exceeds the viewport.
2. **Problems:** Trailing timeline breaks the fixed workspace; magic offset (102px);
   profile/journey are tabs outside the grid.
3. **Proposed:** Bring **everything** into a `Workspace`: table-primary citizen list
   + `InspectorPanel` profile; timeline and journey become inspector tabs, not
   trailing content.
4. **Panels:** Primary = citizen `DataTable` (or list); `InspectorPanel` = tabs
   `[Profile | Enrollments | Timeline | Clinical Journey]`.
5. **Scrolling:** List body and inspector each scroll independently; page fixed.
6. **Navigation:** `Tabs` in the inspector; deep-link `?c=` retained; list search
   sticky.
7. **Complexity:** **M** (relocate timeline into inspector; adopt primitives; grid
   exists).
8. **Wireframe:**
```
┌ Citizens ──────────────────────────── [Register] [Bulk Upload]  🔎 ────────────┐
│ ┌ Citizens (DataTable) ───────────────┐ ┌ Inspector ───────────────────────┐  │
│ │ 🔎 search                           │ │ [Profile][Enroll][Timeline][Journey]│ │
│ │ Name      UHID     Programs  Risk ▸ │ │ Ram Kumar · 54 · M · HTN, DM       │ │
│ │ Ram K. ◄  00123    HTN,DM    MOD    │ │ Enrollments: HTN ▸ · DM            │ │
│ │ Asha D.   00124    ANC       LOW    │ │ ┌ Enrollment info ──────────────┐  │ │
│ │ …  (scrolls)                        │ │ │ program · status · MO         │  │ │
│ └─────────────────────────────────────┘ └────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.5 Clinical Journey (Citizens → Journey tab / `ClinicalJourney`)
1. **Current:** Journey tab swaps to `cz-workspace--journey (272px | 1fr)` with CDSE
   panel + journey list.
2. **Problems:** Long journey list shares one scroll with CDSE; no density control.
3. **Proposed:** Becomes the **Journey inspector tab** of Citizens: CDSE summary
   (pinned) over a scrolling journey feed.
4. **Panels:** Primary citizen list; `InspectorPanel` Journey tab = CDSE summary +
   feed.
5. **Scrolling:** Feed scrolls; CDSE summary pinned.
6. **Navigation:** Entries expand in place; filter by program/type.
7. **Complexity:** **S–M**.
8. **Wireframe:** *(Citizens inspector, Journey tab — CDSE summary over feed)*

### 5.6 Consultation Workspace (`/worklist/[id]/consult`) — flagship
1. **Current:** 2-column `cw-workspace-b` at `calc(100vh − 130px)`: wizard | note
   column that stacks **four** panels (CDSE → Care Plan → Note → History) in one
   scroll. Patient header + call bar above.
2. **Problems:** Four panels share one scroll; no sticky "Complete Consultation";
   130px magic offset.
3. **Proposed:** `WorkspaceHeader` = patient identity + call controls; `SplitPane`
   workspace: Wizard | Live Note | `InspectorPanel` with **tabs** (CDSE | Care Plan |
   History); `StickyActionBar` (Save Draft · Complete Consultation).
4. **Panels:** `[ Counselling wizard ] [ Live note ] [ InspectorPanel tabs ]` +
   sticky action bar.
5. **Scrolling:** Each region independent; header, call bar, action bar pinned; page
   fixed.
6. **Navigation:** Wizard steps stay; inspector tabs so nothing is buried; Complete
   always reachable.
7. **Complexity:** **L** (introduces `SplitPane`, tabbed inspector, sticky action bar
   together — highest clinical value).
8. **Wireframe:**
```
┌ Consult · Ram Kumar · UH-00123 · HTN ─── 📞 In call 04:12  [End Call] ──────────┐
│ ┌ Counselling wizard ───┐ ┌ Live note ─────────┐ ┌ Inspector ─────────────────┐ │
│ │ Section 3/6 Lifestyle │ │ (auto-updates as    │ │ [CDSE][Care Plan][History] │ │
│ │ ☑ Reduce salt         │ │  items are checked) │ │ Risk: MODERATE             │ │
│ │ ☐ 30-min walk         │ │ SUBJECTIVE …        │ │ Goals: 2 open              │ │
│ │  ‹ Back     Next ›    │ │ PLAN …              │ │ Prev: 12 Jun · LOW         │ │
│ └───────────────────────┘ └─────────────────────┘ └────────────────────────────┘ │
│ [ Save Draft ]                                     [ Complete Consultation → ]   │ ← sticky
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.7 Care Plan (`components/care-plan/*`)
1. **Current:** `CarePlanPanel`/`CarePlanEditor` embedded as one card in the
   Consultation scroll column (and Citizens).
2. **Problems:** No room as a stacked card; goals/interventions/progress compete
   vertically.
3. **Proposed:** Standalone = `WorkspaceGrid` `[ Goals+Interventions | Progress+CDSE
   suggestions (InspectorPanel) ]` + sticky Save. Embedded = the **Care Plan tab** of
   the Consultation inspector.
4. **Panels:** Primary goals/interventions `Panel`; `InspectorPanel` progress +
   suggestions; `StickyActionBar`.
5. **Scrolling:** Each pane independent; save bar pinned.
6. **Navigation:** Goal add/edit in-panel; one-click accept suggestions.
7. **Complexity:** **M**.
8. **Wireframe:**
```
┌ Care Plan · Ram Kumar ─────────────────────────────── [Add Goal] ──────────────┐
│ ┌ Goals & interventions ──────────┐ ┌ Inspector: Progress & suggestions ─────┐ │
│ │ ◎ BP < 140/90  (2 actions)      │ │ Timeline ▉▉▉▁▁ improving                │ │
│ │ ◎ HbA1c < 7    (1 action)       │ │ CDSE suggests: add salt goal  [Accept] │ │
│ └─────────────────────────────────┘ └────────────────────────────────────────┘ │
│ [ Discard ]                                                        [ Save Plan ]│
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.8 Knowledge Hub (`/knowledge-base`)
1. **Current:** `.kh-page` + `kh-tabs` (FAQ/Training/Emergency) + `kh-panel`;
   document scroll.
2. **Problems:** Search + content scroll together; no fixed reading pane.
3. **Proposed:** Table/list-primary + reading `InspectorPanel`; tabs → `Tabs`.
4. **Panels:** Primary = searchable list; `InspectorPanel` = article reading pane.
5. **Scrolling:** List and reading pane independent; search pinned.
6. **Navigation:** Segment control tabs; deep-link FAQ/protocol.
7. **Complexity:** **M**.
8. **Wireframe:**
```
┌ Knowledge Hub ─────────── [FAQ][Training][Emergency]  🔎 ───────────────────────┐
│ ┌ Results ─────────────┐ ┌ Inspector: reading pane ───────────────────────────┐ │
│ │ • Hypertension FAQ ◄ │ │ Q: When to refer HTN?                              │ │
│ │ • TB DOTS            │ │ A: Refer if BP ≥ 180/110 …                         │ │
│ │ • Danger signs       │ │ Related protocols · attachments                    │ │
│ └──────────────────────┘ └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.9 Notifications (`/notifications`)
1. **Current:** `.page` + `notif-list`; document scroll.
2. **Problems:** Long alert list scrolls the page; no triage; no detail beside it.
3. **Proposed:** Table-primary — alert `DataTable` + `InspectorPanel` (detail +
   resolve); severity filters in header.
4. **Panels:** Primary alert `DataTable`; `InspectorPanel` = alert detail/actions.
5. **Scrolling:** List and detail independent; filters pinned.
6. **Navigation:** Alert → citizen/consultation; resolve inline; bell "View all"
   deep-links here.
7. **Complexity:** **S–M**.
8. **Wireframe:**
```
┌ Notifications ── [All][Severe][Moderate][Resolved] ─────────────────────────────┐
│ ┌ Alerts (DataTable) ──────────────┐ ┌ Inspector: alert detail ───────────────┐ │
│ │ Sev  Citizen   Disease  When   ▸ │ │ Ram Kumar · HTN · SEVERE · 12 Jun      │ │
│ │ ⚠    Ram K.    HTN      12 Jun ◄ │ │ Trigger: BP danger sign answered YES   │ │
│ │ ◈    Asha D.   DM       11 Jun   │ │ [Open consultation] [Resolve]          │ │
│ └──────────────────────────────────┘ └────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.10 Administration (`/administration` + sub-pages)
1. **Current:** `.page` console of tiles → Data Quality, Workflow Rules, Scheduler,
   Account Settings; each sub-tool is its own full page.
2. **Problems:** Console scrolls; each tool a separate page (context loss); no
   shared admin shell/sub-nav.
3. **Proposed:** One admin `Workspace`: admin sub-nav rail (`InspectorPanel`-style
   left nav) + tool rendered in the primary panel — many tools, one workspace.
4. **Panels:** Left admin nav (Governance/Configuration/System) + primary tool panel.
5. **Scrolling:** Tool panel scrolls; nav fixed.
6. **Navigation:** Sidebar "Administration" expands to sub-items; rail mirrors.
7. **Complexity:** **M** (re-parent existing sub-pages).
8. **Wireframe:**
```
┌ Administration ─────────────────────────────────────────────────────────────────┐
│ ┌ Admin nav ───────┐ ┌ Tool workspace (primary panel) ────────────────────────┐ │
│ │ Governance       │ │ Data Quality · Duplicates queue (DataTable)            │ │
│ │  • Data Quality ◄│ │ ┌ table (sticky header) ─────────────────────────────┐ │ │
│ │ Configuration    │ │ │ …                                                  │ │ │
│ │  • Workflow Rules│ │ └────────────────────────────────────────────────────┘ │ │
│ │  • Scheduler     │ │                                                        │ │
│ │ System           │ │                                                        │ │
│ │  • Account       │ │                                                        │ │
│ └──────────────────┘ └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.11 Programs · 5.12 Diseases · 5.15 Outcome Templates (config registries)
1. **Current:** No dedicated routes today; data-driven config surfaces.
2. **Problems:** Greenfield — must not each invent a layout.
3. **Proposed:** One shared **Registry workspace**: record `DataTable` (primary) +
   record editor `InspectorPanel` + `StickyActionBar`. Programs, Diseases, Outcome
   Templates all instantiate it; reached from Administration sub-nav.
4. **Panels:** Primary record `DataTable`; `InspectorPanel` editor; sticky Save.
5. **Scrolling:** List and editor independent.
6. **Navigation:** Admin sub-nav; deep-link by id.
7. **Complexity:** **L once** (shared template) → **S each** thereafter.
8. **Wireframe:**
```
┌ Administration › Outcome Templates ───────────────────── [New Template] ────────┐
│ ┌ Templates (DataTable) ┐ ┌ Inspector: editor ─────────────────────────────────┐ │
│ │ Name          Event ◄ │ │ Name · Event · Fields[]                            │ │
│ │ ANC visit     ANC     │ │ ┌ field ────────────────────────────────────────┐  │ │
│ │ HTN follow-up HTN     │ │ │ label · type · required · options              │  │ │
│ └───────────────────────┘ └────────────────────────────────────────────────────┘ │
│ [ Cancel ]                                                             [ Save ]   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.13 Guidebooks (`/guidebooks`)
1. **Current:** Already List-Detail: `gb-workspace (308px | 1fr)` at `calc(100vh −
   196px)` with `gb-list` + `gb-main` (tabs, overview, action bar). Closest to
   target.
2. **Problems:** Largest magic offset (196px); bespoke `GuidebookTabs`/
   `GuidebookActionBar`; tall header stack.
3. **Proposed:** Keep structure; adopt `Workspace` + `WorkspaceGrid` (list primary +
   detail `Panel`) + `Tabs` + `StickyActionBar`; drop the 196px math.
4. **Panels:** Primary guidebook list; detail `Panel` (tabs + content); sticky
   actions.
5. **Scrolling:** List and detail independent.
6. **Navigation:** Deep-link `?g=` retained (Citizens → Open Guidebook).
7. **Complexity:** **S–M** (adoption, not rebuild). **Recommended reference
   implementation for Phase 1** (lowest risk).
8. **Wireframe:**
```
┌ Guidebooks ─────────────────────────────────────────────────────────────────────┐
│ ┌ List ─────────┐ ┌ Detail Panel ───────────────────────────────────────────┐   │
│ │ 🔎            │ │ HTN Protocol   [Overview][Sections][Referral]           │   │
│ │ • HTN      ◄  │ │ ┌ content (scroll) ─────────────────────────────────┐   │   │
│ │ • Diabetes    │ │ │ Key steps · escalation · counselling items         │   │   │
│ │ • TB DOTS     │ │ └────────────────────────────────────────────────────┘   │   │
│ └───────────────┘ └──────────────────────────────────  [ Edit ] [ Save ] ────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.14 Training (Knowledge → `TrainingModule`)
1. **Current:** A module/tab inside Knowledge Hub.
2. **Problems:** Shares Knowledge's document scroll; content vs progress compete.
3. **Proposed:** Rides the Knowledge template: module list (primary) + content
   `InspectorPanel` with a progress rail.
4. **Panels:** Primary module list; `InspectorPanel` lesson content + progress.
5. **Scrolling:** Content pane scrolls; list/progress pinned.
6. **Navigation:** Resume last module; deep-link lessons.
7. **Complexity:** **S** (rides the Knowledge template).
8. **Wireframe:** *(Knowledge shape + progress rail)*

### 5.16 Reports & Analytics (`/reports`)
1. **Current:** `rp-tabs` + many `analytics/*Section` blocks + `Charts` — the
   **longest scroller** in the app, in a plain `.page`.
2. **Problems:** Dozens of charts stack vertically; filter bar scrolls away; heavy
   mount cost.
3. **Proposed:** Analytics workspace — section-nav rail + pinned `FilterBar` +
   scrollable chart canvas; treat KPIs as a `KpiRibbon` and each section as a
   `Panel` grid.
4. **Panels:** Left section nav + filters (fixed); primary chart-canvas `Panel`
   (lazy-mount per section).
5. **Scrolling:** Only the chart canvas scrolls; filters/section nav pinned.
6. **Navigation:** Section rail replaces long scroll; export stays; sticky filters.
7. **Complexity:** **L**.
8. **Wireframe:**
```
┌ Reports & Analytics ── [Date ▾][Program ▾][Export]  (filters pinned) ────────────┐
│ ┌ Sections ─────┐ ┌ Chart canvas (scroll) ─────────────────────────────────────┐ │
│ │ • Executive ◄ │ │ KPI ribbon: ┌KPI┐┌KPI┐┌KPI┐                                │ │
│ │ • Programs    │ │ ┌ trend ┐ ┌ bar ┐ ┌ table ───────────────────────────────┐ │ │
│ │ • Worklist …  │ │ └───────┘ └─────┘ └──────────────────────────────────────┘ │ │
│ └───────────────┘ └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.17 All major data tables (cross-cutting)
1. **Current:** `WorklistTable`, Data Quality tables, admin lists — bespoke, header
   scrolls with body, no density, fake/absent pagination.
2. **Problems:** Inconsistent; header loss; no virtualization.
3. **Proposed:** One `DataTable` (reference-modeled: sticky sortable header, sub-line
   cells, status pills, inline actions, density modes, real paging/virtualization,
   row → `InspectorPanel`).
4. **Scrolling:** Body scrolls within its panel; page never scrolls.
5. **Complexity:** **M** (build once, adopt everywhere).

---

## 6. Reusable Component Build-Out (shared, precedes page migration)

| Component | Complexity | Notes |
|---|---|---|
| Design tokens (spacing/type/radius/shadow/z) | **S** | Additive CSS variables; no visual change until adopted |
| `Workspace` + `WorkspaceHeader` + `WorkspaceGrid` | **M** | Removes all `calc(100vh − Npx)` math |
| `Panel` + `PanelHeader` + `PanelContent` | **S–M** | Wrap existing card markup incrementally |
| `InspectorPanel` | **S** | Specialized right-hand `Panel` with tab support |
| `DataTable` | **L** | Sticky sortable header, density, sub-line cells, status pills, inline actions, paging/virtualization |
| `KpiRibbon` | **S** | Dense one-row stat strip (reference) |
| `StickyActionBar` | **S** | Pin Save/Complete |
| `SplitPane` | **M** | Drag-resize + persisted sizes (Consultation) |
| `Tabs` | **S** | Replaces `cz-tab-bar`/`rp-tabs`/`kh-tabs`/`GuidebookTabs` |
| Collapsible sidebar states | **M** | expanded/collapsed/hover + persistence + badges |

---

## 7. Implementation Strategy (incremental, non-breaking)

The golden rule: **new primitives land dormant, pages opt in one at a time, and no
page changes behavior when it adopts them.** On any layout ambiguity in a phase,
match `UI reference.png`.

- **Phase 0 — Tokens (S).** Add spacing/type/radius/shadow/z variables to `:root`.
  Purely additive; nothing consumes them yet. Zero visual change.
- **Phase 1 — Primitives + reference page (M).** Build `Workspace`,
  `WorkspaceHeader`, `WorkspaceGrid`, `Panel*`, `InspectorPanel`, `StickyActionBar`.
  Convert **Guidebooks** first (lowest risk, closest to target); delete its 196px
  magic number. This is the pattern all other pages copy.
- **Phase 2 — Dashboard = reference exemplar (M).** Build `KpiRibbon` + `DataTable`
  (v1) and assemble Dashboard to match the reference (ribbon + table + inspector).
  Establishes the table-primary + inspector benchmark visibly.
- **Phase 3 — Collapsible sidebar (M).** expanded/collapsed/hover + badges +
  persistence. Benefits every page immediately.
- **Phase 4 — Flagship Consultation (L).** `SplitPane` + tabbed inspector
  (CDSE/Care Plan/History) + sticky "Complete Consultation."
- **Phase 5 — List modules (M).** Worklist, Citizens (move timeline into inspector),
  Notifications — table-primary + `InspectorPanel`.
- **Phase 6 — Tables everywhere (L).** Harden `DataTable` (real pagination/
  virtualization); adopt in Data Quality and admin lists.
- **Phase 7 — Knowledge/Training + Administration (M).** List-detail + admin sub-nav.
- **Phase 8 — Reports & config registries (L).** Reports section-rail + lazy charts;
  Registry template → Programs, Diseases, Outcome Templates.
- **Phase 9 — Typography cleanup (M, ongoing).** Replace the 462 hardcoded font
  sizes with tokens; retire dead CSS; enforce the 12px density floor.

Each phase is independently shippable and reversible. Routes, data, permissions, and
workflows are untouched; only layout containers change. Legacy `.page` pages keep
working until their phase migrates them.

---

## 8. Decisions — resolved by the approved direction

| Question (v1) | Resolution (v2) |
|---|---|
| Overall model | **Approved:** desktop workspace, single-viewport, table-primary + inspector, per the reference |
| Reusable primitives | **Approved names, canonical:** `Workspace`, `WorkspaceHeader`, `WorkspaceGrid`, `Panel`, `PanelHeader`, `PanelContent`, `InspectorPanel` (+ supporting `DataTable`/`KpiRibbon`/`StickyActionBar`/`SplitPane`/`Tabs`) |
| Density default | **Compact** (matches reference); comfortable/dense available |
| List modules | **Table-primary with adjacent `InspectorPanel`** — no separate detail pages |
| Visual benchmark | **`UI reference.png`** — consult on any ambiguity; adopt structure only, **never** its branding/colors/icons/identity |

### Remaining open items (still your call)
1. **Global search / `⌘K`:** build now or remove the disabled input until ready?
2. **`SplitPane` resizing:** ship resizable in v1, or fixed splits first?
3. **Config registries (Programs/Diseases/Outcome Templates):** build UIs in M27, or
   ship the shared Registry template only and defer the three?
4. **Sidebar default state** (expanded vs collapsed) per role on first load?

---

*End of Milestone 27 Workspace UI/UX Architecture (v2, approved direction
incorporated). No code has been written or modified. The reference image is the
visual benchmark. Awaiting final approval before implementation.*
