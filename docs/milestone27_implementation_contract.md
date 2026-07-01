# Milestone 27 — Workspace UI/UX **Implementation Contract**

**Status:** Design-only. Binding specification. **No code until explicitly approved.**
**Source of truth (in priority order):**
1. This contract (`docs/milestone27_implementation_contract.md`) — the *how*.
2. `docs/milestone27_workspace_ux_architecture.md` (v2) — the *why*.
3. `C:\Users\TMDL DiNC Assam\Desktop\New method\Reference\UI reference.png` — the
   **visual benchmark**. On ANY uncertainty about layout, spacing, density, or panel
   organization, **defer to the screenshot first.**

> **Adopt the reference's structure and density. Never copy its branding, colors,
> icons, product name, or identity.** DiNC keeps its own brand: the green palette
> (`--p #24a148` family), DiNC name, and health iconography are unchanged.

Developers implementing M27 make **no design decisions.** Everything below is
prescribed. If something is genuinely unspecified, stop and ask — do not improvise.

---

## Part A — Binding Migration Rules (non-negotiable)

Every commit in this milestone MUST obey all of these. A change that violates any
rule is rejected in review.

**Layout & scrolling**
1. **Never use `calc(100vh - Npx)`** (or any hardcoded viewport-offset math) in any
   new or migrated code. The existing `102px`/`130px`/`196px` offsets are deleted as
   their pages migrate. Height flows from the shell via flexbox (`height:100%` /
   `min-height:0`).
2. **Never introduce page/body scrolling.** `html, body, .shell, .shell-main`, and a
   migrated page's `Workspace` never scroll.
3. **Scrolling happens only inside `PanelContent`** (and `DataTable` bodies, which
   render inside `PanelContent`). No other element gets `overflow: auto/scroll`.
4. **No page-specific layout systems.** No page defines its own grid/flex shell.
   Every page composes the 12 primitives in Part C. Bespoke shells
   (`cw-workspace-b`, `cz-workspace`, `gb-workspace`, `.page`, `rp-tabs`, `kh-tabs`,
   `cz-tab-bar`, `notif-list` as a layout) are replaced, not extended.
5. **One shell, one Workspace per page.** A route renders exactly one `Workspace`.

**CSS & tokens**
6. **Use design tokens** (Part B). No new hardcoded `font-size`, `padding`, `margin`,
   `border-radius`, `color`, `z-index`, or breakpoint literals in component CSS.
7. **No duplicated CSS.** Shared styling lives on the primitive's class. Pages add
   only composition (which primitives, what widths via props/tokens), never restyle
   a primitive.
8. **CSS strategy is unchanged in kind:** plain global CSS in `globals.css` with
   token variables and namespaced primitive classes (`ws-`, `wsh-`, `wsg-`,
   `panel-`, `insp-`, `dt-`, `kpi-`, `sab-`, `split-`, `tabs-`). No Tailwind, no CSS
   Modules, no CSS-in-JS introduced.

**Preservation (zero functional regression)**
9. **Preserve all existing functionality.** Data fetching, permissions (`can(...)`),
   dev user switch, notification bell polling, auto-save, call lifecycle, dialogs —
   behavior is byte-for-byte equivalent; only the layout container changes.
10. **Preserve routing.** All routes, route params, and deep-link query params
    (`?c=`, `?g=`, `?returnUrl=`) work exactly as today.
11. **Preserve backend APIs.** No endpoint, request, or response shape changes. This
    is a frontend-layout milestone only.
12. **Preserve accessibility & keyboard behavior** that exists today (e.g. account
    menu Escape/click-outside), and add the new a11y requirements in Part C.

**Process**
13. **Every commit is independently buildable** (`cd frontend && npm run build`
    passes) and independently revertable.
14. **Migrate one page per commit** after the primitives exist. Never batch multiple
    page migrations in one commit.
15. **Legacy pages keep working** until their migration commit. Primitives land
    dormant; adoption is per-page.

---

## Part B — Design Token Contract

Added to `:root` in `globals.css` (Phase 0). **Additive only** — existing tokens
(`--p`, `--ps`, `--pl`, `--bg`, `--card`, `--bd`, `--tp`, `--ts`, `--er`, `--font`)
are retained unchanged. Nothing consumes the new tokens until a component/page
adopts them, so Phase 0 has **zero visual change**.

```css
:root {
  /* Spacing — 4px base */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px;

  /* Type scale (16px root); min body/label = 12px */
  --fs-2xs: 11px; --fs-xs: 12px; --fs-sm: 13px; --fs-md: 14px; /* base */
  --fs-lg: 16px;  --fs-xl: 20px; --fs-2xl: 24px; --fs-3xl: 30px;
  --lh-tight: 1.25; --lh-normal: 1.45;
  --fw-regular: 400; --fw-medium: 500; --fw-semibold: 600; --fw-bold: 700;

  /* Radius */
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px; --radius-pill: 999px;

  /* Elevation */
  --shadow-sm: 0 1px 2px rgba(16,24,40,.06);
  --shadow-md: 0 4px 12px rgba(16,24,40,.08);

  /* Z-index scale */
  --z-base: 0; --z-panel-header: 10; --z-sticky-bar: 20;
  --z-sidebar-hover: 60; --z-dropdown: 70; --z-dialog: 100; --z-toast: 120;

  /* Shell geometry */
  --shell-header-h: 58px;
  --sb-w-expanded: 224px;
  --sb-w-collapsed: 60px;

  /* Workspace geometry defaults (reference-matched, compact) */
  --ws-gap: var(--sp-3);              /* gap between panels */
  --ws-pad: var(--sp-4);              /* workspace outer padding */
  --panel-pad: var(--sp-4);
  --panel-header-h: 44px;
  --list-col-w: 280px;                /* master list column */
  --inspector-w: 340px;               /* InspectorPanel default */
  --kpi-h: 64px;                      /* KPI ribbon height */
  --row-h-comfortable: 40px;
  --row-h-compact: 32px;              /* DEFAULT density */
  --row-h-dense: 28px;
}

/* Breakpoints (documented scale; use these literals ONLY in media queries) */
/* --bp-sm 640 · --bp-md 768 · --bp-lg 1024 · --bp-xl 1280 · --bp-2xl 1536 */
```

**Density default = compact.** A `data-density="comfortable|compact|dense"` attribute
on `Workspace` (or the app root) switches `--row-h-*` and panel padding. Persist the
user's choice in `localStorage` (`dinc.density`).

**Typography migration:** during each page migration, replace that page's hardcoded
`font-size` values with the nearest token. Do not attempt a global sweep in one
commit (Phase 9 finishes the long tail). Never add a new hardcoded size.

---

## Part C — Reusable Component Contracts

Twelve components. Each is a client component under
`frontend/src/components/workspace/` (except `DataTable`, which may live in
`components/workspace/table/`). Class names are namespaced as noted in Rule A8.
Types live beside the component and are exported.

Common conventions:
- All accept `className?: string` and `style?: CSSProperties` (merged last).
- All accept `data-*` passthrough via rest props where noted.
- No component fetches data or knows about routes; pages wire data/handlers.

### C.1 `Workspace`
- **Purpose:** The fixed, viewport-filling root of a page. Replaces every bespoke
  page shell and all `calc(100vh - Npx)` math.
- **Props:**
  ```ts
  interface WorkspaceProps {
    children: ReactNode;               // exactly one WorkspaceHeader + one WorkspaceGrid (+ optional StickyActionBar)
    density?: 'comfortable' | 'compact' | 'dense'; // default 'compact'
    padded?: boolean;                  // default true → applies --ws-pad; false for edge-to-edge
    className?: string;
  }
  ```
- **Behavior:** Renders `display:flex; flex-direction:column; height:100%;
  min-height:0; overflow:hidden`. Sets `data-density`. It is the only child the
  migrated page returns. Requires its parent (`.shell-content`) to be a height/flex
  context (see Part D).
- **Scrolling:** Never scrolls.
- **Sizing:** Fills `.shell-content` exactly (`height:100%`, `flex:1`).
- **Responsive:** No internal breakpoints; children handle collapse.
- **Accessibility:** Renders a `<main>`-less region (the shell already owns `<main>`);
  use a plain `<div role="region" aria-label={...}>` only if a label is provided,
  else a neutral `<div>`.

### C.2 `WorkspaceHeader`
- **Purpose:** Fixed page header inside the Workspace: title/breadcrumb · optional
  search slot · primary actions. Matches the reference header band.
- **Props:**
  ```ts
  interface WorkspaceHeaderProps {
    title: ReactNode;
    breadcrumb?: { label: string; href?: string }[];
    search?: ReactNode;         // slot; M27 passes the EXISTING (disabled) search unchanged
    actions?: ReactNode;        // right cluster (buttons); account/bell remain in the shell TopBar
    tabs?: ReactNode;           // optional page-level Tabs rendered on a second row
    className?: string;
  }
  ```
- **Behavior:** Height `var(--shell-header-h)` (single row) or auto (if `tabs`).
  Title left, `search` center-left, `actions` right. Does not duplicate the global
  TopBar; it is the *page* header within the workspace.
- **Scrolling:** Fixed; never scrolls.
- **Sizing:** `flex-shrink:0`; full width.
- **Responsive:** `<768px` the search slot collapses to an icon button; actions
  overflow into a "⋯" menu.
- **Accessibility:** `<header>`; breadcrumb is a `<nav aria-label="Breadcrumb">` with
  an ordered list; title is the page's `<h1>`.

### C.3 `WorkspaceGrid`
- **Purpose:** The fixed grid arranging panels below the header. Owns column/row
  templates and responsive collapse. Replaces all per-page grid CSS.
- **Props:**
  ```ts
  interface WorkspaceGridProps {
    children: ReactNode;
    template:
      | 'single'                 // one panel fills
      | 'list-detail'            // [--list-col-w | 1fr]
      | 'primary-inspector'      // [1fr | --inspector-w]
      | 'list-primary-inspector' // [--list-col-w | 1fr | --inspector-w]
      | 'ribbon+primary-inspector'; // row: KpiRibbon; then [1fr | --inspector-w]
    gap?: string;                // default var(--ws-gap)
    className?: string;
  }
  ```
- **Behavior:** CSS Grid with the named template mapped to `grid-template-columns`
  and (for ribbon templates) `grid-template-rows: var(--kpi-h) 1fr`. Column widths
  come from tokens; `1fr` cells get `min-width:0` so children can shrink and their
  own `PanelContent` scrolls.
- **Scrolling:** Never scrolls; it is a fixed frame.
- **Sizing:** `flex:1; min-height:0` inside the Workspace.
- **Responsive:**
  - `≥1536`: full template.
  - `1024–1535`: inspector column may narrow to `min(--inspector-w, 30vw)`.
  - `768–1023`: inspector becomes a toggUEable overlay drawer (grid drops to
    `list | 1fr` or `1fr`); list column may become a drawer too.
  - `<768`: single column; secondary regions become drawers/tabs.
- **Accessibility:** Presentational grid; label regions on the panels, not here.

### C.4 `Panel`
- **Purpose:** A self-contained region that owns its own scroll. The unit of layout.
- **Props:**
  ```ts
  interface PanelProps {
    children: ReactNode;          // typically PanelHeader + PanelContent (+ StickyActionBar)
    variant?: 'default' | 'flush' | 'subtle'; // flush = no padding (tables); subtle = nested/inspector
    className?: string;
    'aria-label'?: string;
  }
  ```
- **Behavior:** `display:flex; flex-direction:column; min-height:0; min-width:0;
  background:var(--card); border:1px solid var(--bd); border-radius:var(--radius-md);
  overflow:hidden`.
- **Scrolling:** The Panel itself never scrolls; its `PanelContent` child does.
- **Sizing:** Fills its grid cell (`height:100%`).
- **Responsive:** Inherits from the grid.
- **Accessibility:** `<section aria-label>` when labeled; otherwise relies on
  `PanelHeader`'s heading.

### C.5 `PanelHeader`
- **Purpose:** Panel title + subtitle + panel-level actions (sticky within the panel).
- **Props:**
  ```ts
  interface PanelHeaderProps {
    title: ReactNode;
    subtitle?: ReactNode;         // e.g. "Next 8 pending activities · Guide + Call"
    actions?: ReactNode;          // e.g. <button>+ New Patient</button>, density toggle
    className?: string;
  }
  ```
- **Behavior:** Min-height `var(--panel-header-h)`; title (`--fs-sm`/`--fw-semibold`),
  optional subtitle (`--fs-xs`/`--ts`), actions right-aligned.
- **Scrolling:** `position:sticky; top:0; z-index:var(--z-panel-header)` so it stays
  pinned while `PanelContent` scrolls.
- **Sizing:** `flex-shrink:0`; full width; bottom border `1px var(--bd)`.
- **Responsive:** `<640px` actions collapse into a "⋯" menu.
- **Accessibility:** Title renders an `<h2>`/`<h3>` per nesting depth; actions are
  real `<button>`s with labels.

### C.6 `PanelContent`
- **Purpose:** The panel's scroll region — **the only place scrolling happens.**
- **Props:**
  ```ts
  interface PanelContentProps {
    children: ReactNode;
    padded?: boolean;             // default true → var(--panel-pad); false for tables
    className?: string;
  }
  ```
- **Behavior:** `flex:1; min-height:0; overflow:auto`. Thin custom scrollbar styling
  via tokens.
- **Scrolling:** `overflow:auto` (vertical always allowed; horizontal only when a
  child requires it, e.g. a wide table).
- **Sizing:** Fills remaining panel height.
- **Responsive:** Unchanged; content reflows.
- **Accessibility:** `tabindex="0"` when it is a scroll container with no focusable
  children (so keyboard users can scroll); `role="region"` + `aria-label` optional.

### C.7 `InspectorPanel`
- **Purpose:** A specialized right-hand `Panel` for contextual/supporting info
  adjacent to the primary panel (detail, grouping, related feeds, tabs). Embodies
  "adjacent panel, not a separate page."
- **Props:**
  ```ts
  interface InspectorPanelProps {
    children: ReactNode;          // may contain Tabs + PanelContent(s)
    width?: string;               // default var(--inspector-w)
    collapsible?: boolean;        // default true
    collapsed?: boolean;          // controlled; default false
    onCollapsedChange?: (c: boolean) => void;
    emptyState?: ReactNode;       // shown when no selection drives it
    'aria-label': string;
    className?: string;
  }
  ```
- **Behavior:** Extends `Panel` (`variant='subtle'`). When `collapsed`, renders a thin
  rail (~`var(--sp-8)`) with an expand affordance. On `<1024px` becomes an overlay
  drawer opened by a toggle in the primary panel's header.
- **Scrolling:** Its inner `PanelContent`(s) scroll; the frame does not.
- **Sizing:** Fixed `width`; `flex-shrink:0`.
- **Responsive:** `1024–1535` may narrow; `<1024` overlay drawer; `<768` full-width
  drawer.
- **Accessibility:** `aria-label` required; when a drawer, `role="dialog"` +
  focus-trap + Escape to close; collapse toggle is a labeled `<button aria-expanded>`.

### C.8 `DataTable`
- **Purpose:** The primary workspace for list modules. Modeled on the reference table
  (sortable headers, sub-line cells, status pills, inline row actions).
- **Props:**
  ```ts
  interface DataTableColumn<T> {
    key: string;
    header: ReactNode;
    render: (row: T) => ReactNode;        // may return sub-line cells / pills / action buttons
    width?: string;                        // fixed or 'minmax(...)'; omit = auto
    align?: 'left' | 'center' | 'right';   // default 'left'
    sortable?: boolean;                    // default false
    sticky?: boolean;                      // sticky first column; default false
  }
  interface DataTableProps<T> {
    columns: DataTableColumn<T>[];
    rows: T[];
    getRowId: (row: T) => string;
    selectedId?: string | null;            // drives adjacent InspectorPanel
    onSelect?: (row: T) => void;           // row click
    onRowAction?: (action: string, row: T) => void; // inline actions
    sort?: { key: string; dir: 'asc' | 'desc' } | null;
    onSortChange?: (s: { key: string; dir: 'asc' | 'desc' }) => void;
    density?: 'comfortable' | 'compact' | 'dense'; // default inherits Workspace (compact)
    loading?: boolean;
    emptyState?: ReactNode;
    pagination?: {                          // omit for virtualization mode
      page: number; pageSize: number; total: number;
      onPageChange: (page: number) => void;
    };
    className?: string;
  }
  ```
- **Behavior:** Renders inside `Panel variant="flush"` → `PanelContent padded={false}`.
  Sortable headers toggle asc/desc and set `aria-sort`. Selected row is highlighted
  and reported via `onSelect`. Inline action buttons stop propagation. Row height =
  `--row-h-<density>`. **Replaces the non-functional `‹ 1 ›` placeholder with real
  pagination** (or virtualization for large sets — virtualization is a Phase-6
  hardening, initial version uses pagination).
- **Scrolling:** The table body scrolls vertically inside `PanelContent`; the header
  row is `position:sticky; top:0`. Horizontal scroll only if total column width
  exceeds the panel.
- **Sizing:** Fills its panel; header fixed; body fills remaining height.
- **Responsive:** `<1024px` low-priority columns hide (mark via a `priority` optional
  field later); `<768px` may switch to a stacked card list (Phase-6, opt-in).
- **Accessibility:** Real `<table>` with `<thead>/<th scope="col">`; sortable headers
  are `<button>`s inside `<th aria-sort>`; row selection via `aria-selected` on
  `<tr>` and keyboard (Up/Down to move, Enter to select); action buttons labeled.

### C.9 `KpiRibbon`
- **Purpose:** The dense one-row metric strip under the header (reference ribbon).
- **Props:**
  ```ts
  interface KpiItem {
    id: string; icon?: ReactNode; value: ReactNode; label: string;
    tone?: 'default' | 'danger' | 'warn' | 'success'; onClick?: () => void;
  }
  interface KpiRibbonProps { items: KpiItem[]; className?: string; }
  ```
- **Behavior:** Single non-wrapping row of compact cards (icon · big value · label).
  If items overflow the width, the ribbon scrolls **horizontally** internally (never
  wraps, never grows the page).
- **Scrolling:** Horizontal-only internal scroll when overflowing; height fixed at
  `var(--kpi-h)`.
- **Sizing:** Full width; card `min-width:150px`; gap `var(--sp-3)`.
- **Responsive:** Cards keep min-width; ribbon scrolls on narrow screens.
- **Accessibility:** `role="list"`; each card `role="listitem"`; clickable cards are
  `<button>`s with `aria-label="{label}: {value}"`.

### C.10 `StickyActionBar`
- **Purpose:** Always-visible primary actions (Save/Cancel/Complete) pinned to a
  Panel or Workspace footer.
- **Props:**
  ```ts
  interface StickyActionBarProps {
    children: ReactNode;          // buttons; primary action right-most
    align?: 'end' | 'space-between'; // default 'end'
    className?: string;
  }
  ```
- **Behavior:** `position:sticky; bottom:0; z-index:var(--z-sticky-bar)`; opaque
  background + top border so content scrolls beneath it.
- **Scrolling:** Never scrolls; always visible.
- **Sizing:** `flex-shrink:0`; full width; min-height `48px`.
- **Responsive:** Buttons wrap to two rows only `<480px`; otherwise single row.
- **Accessibility:** Buttons are focus-ordered with the primary action last; not a
  landmark.

### C.11 `SplitPane`
- **Purpose:** A resizable split inside a `WorkspaceGrid` cell (used by Consultation).
- **Props:**
  ```ts
  interface SplitPaneProps {
    children: [ReactNode, ReactNode] | [ReactNode, ReactNode, ReactNode];
    direction?: 'horizontal';     // M27 supports horizontal only
    sizes?: number[];             // ratios; default even
    minSizes?: number[];          // px minimums per pane; default 240
    resizable?: boolean;          // default false (fixed ratios); Consultation sets true
    storageKey?: string;          // persist sizes when resizable
    className?: string;
  }
  ```
- **Behavior:** Renders 2–3 panes separated by drag handles when `resizable`.
  Non-resizable = fixed ratios. Persists sizes to `localStorage` under `storageKey`.
- **Scrolling:** Never scrolls; each pane's own `PanelContent` scrolls.
- **Sizing:** Fills its cell; respects `minSizes`.
- **Responsive:** `<1024px` collapses to stacked panes (vertical), each with capped
  height and internal scroll.
- **Accessibility:** Each drag handle is `role="separator"` with
  `aria-orientation="vertical"`, `aria-valuenow/min/max`, and keyboard resize
  (Arrow keys) + focusable.

### C.12 `Tabs`
- **Purpose:** One in-panel tab system replacing `cz-tab-bar`, `rp-tabs`, `kh-tabs`,
  `GuidebookTabs`.
- **Props:**
  ```ts
  interface TabItem { id: string; label: ReactNode; badge?: ReactNode; }
  interface TabsProps {
    items: TabItem[];
    activeId: string;
    onChange: (id: string) => void;
    variant?: 'segment' | 'underline'; // default 'underline'
    className?: string;
  }
  ```
- **Behavior:** Controlled. Renders a tablist; the page renders the active panel body
  (Tabs is header-only; it does not own content, so it composes with `PanelContent`).
- **Scrolling:** Tab strip never scrolls (scrolls horizontally if overflow); tab
  bodies scroll via their `PanelContent`.
- **Sizing:** `flex-shrink:0`; full width of its container.
- **Responsive:** Overflowing tabs scroll horizontally; never wrap.
- **Accessibility:** Full ARIA tabs pattern: `role="tablist"`, `role="tab"`
  (`aria-selected`, roving `tabindex`), `role="tabpanel"` with `aria-labelledby`;
  Left/Right/Home/End keyboard navigation.

**Component dependency order (build order):**
`tokens → Panel/PanelHeader/PanelContent → Workspace/WorkspaceHeader/WorkspaceGrid →
InspectorPanel, StickyActionBar, Tabs, KpiRibbon → DataTable → SplitPane`.

---

## Part D — Shell Integration Contract

The shell (`AppShell`, `Sidebar`, `TopBar`) keeps its structure. Changes:

1. **`.shell-content` becomes a height/flex context, not a scroller, for workspace
   pages.** Spec: `.shell-content { flex:1; min-height:0; display:flex;
   padding:0 }` **when its child is a `Workspace`** (achieved by a `shell-content
   --workspace` modifier applied by the `(app)` layout once a page opts in, OR by the
   `Workspace` using `position:absolute; inset:0` within a `position:relative`
   `.shell-content`). Until a page migrates, `.shell-content` keeps
   `overflow-y:auto` + padding for legacy `.page` content. The final cleanup commit
   removes the legacy branch.
2. **Sidebar geometry via tokens.** `.shell-sidebar` width switches between
   `var(--sb-w-expanded)` and `var(--sb-w-collapsed)` based on a persisted state
   (`dinc.sidebar` = `expanded|collapsed`). Default: **expanded ≥1280px,
   auto-collapsed <1280px**, user preference overrides.
3. **Sidebar states:** expanded (icon+label), collapsed (icon only + tooltip via
   existing `aria-label`), hover (collapsed sidebar temporarily expands as an
   **overlay** — `position:absolute; z-index:var(--z-sidebar-hover)` — so the
   workspace never reflows). A toggle button in the sidebar footer + `[` shortcut.
   Nav count badges (e.g. Worklist, Reviews) render when a count prop is supplied.
4. **TopBar unchanged** in behavior (brand, disabled search preserved as-is, bell
   polling, account menu/dev switch). `WorkspaceHeader` is the *page* header inside
   the content region and does not duplicate TopBar.

---

## Part E — Per-Page Implementation Specifications

For each page: **final layout · grid structure · panel arrangement · which panel
scrolls · which stays fixed · minimum width · responsive behavior · components used ·
expected interaction · complexity.** Complexity: **S** ≤1d · **M** 2–3d · **L** 4–6d.
On any ambiguity → reference image.

> Legend for "grid structure" uses the `WorkspaceGrid` `template` prop values.

### E.1 Dashboard — `/dashboard`  (reference exemplar)
- **Final layout:** Header · KPI ribbon · `[ primary table | inspector ]`.
- **Grid structure:** `ribbon+primary-inspector`.
- **Panel arrangement:** `KpiRibbon`; Primary `Panel(flush)` = "Follow-up Essentials"
  `DataTable`; `InspectorPanel` stacking three `PanelContent` blocks — By Program
  chips, CPHC Services grid, Recent Activity feed.
- **Scrolls:** DataTable body; Inspector's Recent Activity feed.
- **Fixed:** Header, KPI ribbon, table header, panel headers.
- **Min width:** 1024px (below → inspector becomes drawer).
- **Responsive:** `1024–1535` inspector narrows; `<1024` inspector = drawer, ribbon
  scrolls horizontally; `<768` single column.
- **Components:** Workspace, WorkspaceHeader, WorkspaceGrid, KpiRibbon, Panel,
  PanelHeader, PanelContent, DataTable, InspectorPanel.
- **Interaction:** Row actions (Guide/Call/Open) via `onRowAction`; program chip
  filters the table; density toggle; Studio edit mode preserved.
- **Complexity:** **M**.

### E.2 My Worklist — `/worklist`
- **Final layout:** Header (filters + search) · `[ table | inspector ]`.
- **Grid structure:** `primary-inspector`.
- **Panel arrangement:** Primary `DataTable` (Citizen · Activity · Due · Priority ·
  Status · Actions); `InspectorPanel` = selected activity detail + Guide/Call/Open.
- **Scrolls:** Table body; inspector content.
- **Fixed:** Header/filters, table header, inspector header.
- **Min width:** 1024px.
- **Responsive:** `<1024` inspector drawer; real pagination replaces `‹ 1 ›`.
- **Components:** Workspace, WorkspaceHeader, WorkspaceGrid, Panel*, DataTable,
  InspectorPanel.
- **Interaction:** Row select → inspector; "Open" → Consultation
  (`/worklist/[id]/consult?returnUrl=/worklist`); filter presets; sort.
- **Complexity:** **M**.

### E.3 Citizens (List + Profile + Journey) — `/citizens`
- **Final layout:** Header · `[ citizen list | inspector ]` (Profile is the inspector;
  the Activity/Timeline/Journey become inspector tabs — the trailing
  `PatientTimeline` moves INSIDE the inspector).
- **Grid structure:** `primary-inspector` (list acts as the primary selector) OR
  `list-primary-inspector` if a distinct middle detail panel is retained. **Use
  `list-primary-inspector`:** list · profile summary · inspector(tabs: Enrollments ·
  Activities · Timeline · Clinical Journey).
- **Panel arrangement:** `DataTable`/list (citizens) · `Panel` (summary +
  enrollments) · `InspectorPanel` with `Tabs`.
- **Scrolls:** Each of the three columns' `PanelContent` independently.
- **Fixed:** Header, each panel header, tab strip.
- **Min width:** 1280px (three columns); `<1280` inspector drawer; `<1024` list
  drawer.
- **Responsive:** As above; deep-link `?c=` preserved.
- **Components:** Workspace, WorkspaceHeader, WorkspaceGrid, Panel*, DataTable,
  InspectorPanel, Tabs.
- **Interaction:** Select citizen → summary + inspector load; enrollment select →
  activities; "Start Consultation"/dialogs preserved; **timeline no longer trailing**.
- **Complexity:** **M**.

### E.4 Consultation Workspace — `/worklist/[id]/consult`  (flagship)
- **Final layout:** Header (patient identity + call controls) · `SplitPane[ Wizard |
  Live Note | Inspector(tabs) ]` · `StickyActionBar`.
- **Grid structure:** `single` cell containing a `SplitPane` (resizable, 3 panes).
- **Panel arrangement:** Pane 1 `Panel` = CounsellingWizard; Pane 2 `Panel` = Live
  Note (DocumentationPreview); Pane 3 `InspectorPanel` `Tabs` = CDSE · Care Plan ·
  History.
- **Scrolls:** Each pane's `PanelContent`; the wizard list, the note, and each
  inspector tab scroll independently.
- **Fixed:** Header (identity + call/timer), split handles, StickyActionBar
  (Save Draft · Complete Consultation).
- **Min width:** 1024px (below → panes stack vertically with capped heights).
- **Responsive:** `<1024` SplitPane stacks; inspector tabs remain; action bar sticky.
- **Components:** Workspace, WorkspaceHeader, SplitPane, Panel*, InspectorPanel,
  Tabs, StickyActionBar.
- **Interaction:** Preserve call lifecycle, 6s auto-save, wizard stepping, live-note
  updates, outcome dialog; "Complete Consultation" always visible; `?returnUrl=`
  preserved.
- **Complexity:** **L**.

### E.5 Care Plan — standalone + embedded (`components/care-plan/*`)
- **Final layout (standalone):** Header · `[ goals/interventions | inspector
  (progress + CDSE suggestions) ]` · StickyActionBar. **Embedded:** the "Care Plan"
  tab of the Consultation inspector.
- **Grid structure:** `primary-inspector`.
- **Panel arrangement:** Primary `Panel` = goals + interventions; `InspectorPanel` =
  progress timeline + suggestions.
- **Scrolls:** Both panels' content.
- **Fixed:** Header, panel headers, StickyActionBar (Discard · Save Plan).
- **Min width:** 1024px.
- **Responsive:** `<1024` inspector drawer.
- **Components:** Workspace, WorkspaceHeader, WorkspaceGrid, Panel*, InspectorPanel,
  StickyActionBar.
- **Interaction:** In-panel goal add/edit; one-click accept suggestions; preserve
  existing care-plan APIs.
- **Complexity:** **M**.

### E.6 Knowledge Hub — `/knowledge-base`
- **Final layout:** Header (Tabs: FAQ · Training · Emergency; search) · `[ results
  list | inspector (reading pane) ]`.
- **Grid structure:** `primary-inspector` (list is primary selector).
- **Panel arrangement:** Primary `Panel`/`DataTable` (results) · `InspectorPanel`
  (article reading pane).
- **Scrolls:** Results list; reading pane.
- **Fixed:** Header, tab strip, search, panel headers.
- **Min width:** 1024px.
- **Responsive:** `<1024` reading pane drawer.
- **Components:** Workspace, WorkspaceHeader, Tabs, WorkspaceGrid, Panel*, DataTable,
  InspectorPanel.
- **Interaction:** Search filters list; select → reading pane; deep-link preserved.
- **Complexity:** **M**.

### E.7 Training — Knowledge → Training tab (`TrainingModule`)
- **Final layout:** Same shell as Knowledge; primary module list + inspector (lesson
  content + progress).
- **Grid structure:** `primary-inspector`.
- **Panel arrangement:** Primary module list · `InspectorPanel` (content + progress).
- **Scrolls:** Content pane; list.
- **Fixed:** Header, progress summary.
- **Min width:** 1024px.
- **Responsive:** `<1024` content drawer.
- **Components:** As Knowledge.
- **Interaction:** Resume last module; lesson deep-links.
- **Complexity:** **S** (rides Knowledge template).

### E.8 Notifications — `/notifications`
- **Final layout:** Header (severity Tabs/filters) · `[ alerts table | inspector
  (alert detail) ]`.
- **Grid structure:** `primary-inspector`.
- **Panel arrangement:** Primary `DataTable` (Severity · Citizen · Disease · When ·
  Actions); `InspectorPanel` = alert detail + Open consultation / Resolve.
- **Scrolls:** Table body; inspector content.
- **Fixed:** Header/filters, table header.
- **Min width:** 1024px.
- **Responsive:** `<1024` inspector drawer.
- **Components:** Workspace, WorkspaceHeader, Tabs, WorkspaceGrid, Panel*, DataTable,
  InspectorPanel.
- **Interaction:** Select → detail; resolve inline; bell "View all" deep-links here;
  preserve alert APIs.
- **Complexity:** **S–M**.

### E.9 Administration — `/administration` (+ sub-pages)
- **Final layout:** Header · `[ admin nav list | tool panel ]`. Sub-tools (Data
  Quality, Workflow Rules, Scheduler, Account Settings) render in the primary panel.
- **Grid structure:** `list-detail`.
- **Panel arrangement:** Left `Panel` = grouped admin nav; primary `Panel` = active
  tool (its existing table/form, wrapped, unchanged in behavior).
- **Scrolls:** Tool panel content; nav list if long.
- **Fixed:** Header, nav, tool panel header.
- **Min width:** 1024px.
- **Responsive:** `<1024` nav becomes a drawer/dropdown.
- **Components:** Workspace, WorkspaceHeader, WorkspaceGrid, Panel*, DataTable (for
  tool tables), Tabs (optional within a tool).
- **Interaction:** Sub-route still addressable (`/administration/data-quality` etc.)
  and renders within the admin workspace; sidebar "Administration" may expand to
  sub-items.
- **Complexity:** **M**.

### E.10 Guidebooks — `/guidebooks`  (Phase-1 reference implementation)
- **Final layout:** Header · `[ guidebook list | detail panel (Tabs + content) ]` ·
  StickyActionBar.
- **Grid structure:** `list-detail`.
- **Panel arrangement:** Primary list `Panel` · detail `Panel` with `Tabs`
  (Overview · Sections · Referral) and `StickyActionBar` (Edit · Save).
- **Scrolls:** List; detail content.
- **Fixed:** Header, tab strip, action bar.
- **Min width:** 1024px.
- **Responsive:** `<1024` list drawer.
- **Components:** Workspace, WorkspaceHeader, WorkspaceGrid, Panel*, Tabs,
  StickyActionBar.
- **Interaction:** Deep-link `?g=` preserved (Citizens → Open Guidebook);
  **delete the 196px offset.**
- **Complexity:** **S–M**.

### E.11 Reports & Analytics — `/reports`
- **Final layout:** Header (pinned FilterBar) · `[ section nav | chart canvas ]`.
- **Grid structure:** `list-detail` (nav = list).
- **Panel arrangement:** Left `Panel` = section nav; primary `Panel` = chart canvas
  (KpiRibbon + chart grid), lazy-mounted per active section.
- **Scrolls:** Chart canvas only.
- **Fixed:** Header, FilterBar, section nav.
- **Min width:** 1024px.
- **Responsive:** `<1024` section nav dropdown; charts stack in one column.
- **Components:** Workspace, WorkspaceHeader, WorkspaceGrid, Panel*, KpiRibbon, Tabs
  (optional), DataTable (for tabular sections).
- **Interaction:** Section select swaps canvas (no long scroll); filters sticky;
  export preserved; charts lazy-mount to cut cost.
- **Complexity:** **L**.

### E.12 Programs · E.13 Diseases · E.14 Outcome Templates — Registry template
- **Status:** **Deferred build (gated).** M27 ships the shared **Registry template**;
  the three concrete pages are built only on explicit approval (final phase).
- **Final layout:** Header · `[ record table | inspector (editor) ]` · StickyActionBar.
- **Grid structure:** `primary-inspector`.
- **Panel arrangement:** Primary record `DataTable`; `InspectorPanel` = record editor
  form; `StickyActionBar` (Cancel · Save).
- **Scrolls:** Table body; editor content.
- **Fixed:** Header, table header, action bar.
- **Min width:** 1024px.
- **Responsive:** `<1024` editor drawer.
- **Components:** Workspace, WorkspaceHeader, WorkspaceGrid, Panel*, DataTable,
  InspectorPanel, StickyActionBar.
- **Interaction:** Select → edit; save via existing/admin APIs (when built).
- **Complexity:** **L once** (template) → **S each** thereafter.

---

## Part F — Implementation Order (small, independently-buildable commits)

Each commit: **objective · files expected to change · dependencies · validation ·
rollback safety.** Every commit must pass `cd frontend && npm run build` and change
no backend, no route, no data behavior. Commit message prefix: `M27:`.

**Global validation (applies to every commit):**
- `npm run build` (frontend) passes.
- No page/body scroll on migrated pages at 1280×800 and 1536×864; only panels scroll.
- Migrated page's routes, deep-links, permissions, and actions behave as before.
- No new hardcoded font-size/spacing/color/breakpoint literals (grep check).

---

**Commit 1 — Design tokens (Phase 0)**
- *Objective:* Add the Part B token block to `:root`. No consumption yet.
- *Files:* `frontend/src/app/globals.css`.
- *Dependencies:* none.
- *Validation:* Build passes; **zero visual diff** (screenshot a few pages before/
  after — identical).
- *Rollback:* Delete the added block; fully additive.

**Commit 2 — Panel family**
- *Objective:* `Panel`, `PanelHeader`, `PanelContent` components + CSS (`panel-*`).
- *Files:* `components/workspace/Panel.tsx`, `PanelHeader.tsx`, `PanelContent.tsx`;
  append `panel-*` CSS to `globals.css`.
- *Dependencies:* Commit 1.
- *Validation:* Build passes; render an isolated demo (not wired to a route) or unit
  render; no page consumes it yet.
- *Rollback:* Remove files + CSS; nothing imports them.

**Commit 3 — Workspace shell primitives**
- *Objective:* `Workspace`, `WorkspaceHeader`, `WorkspaceGrid` + CSS.
- *Files:* `components/workspace/Workspace.tsx`, `WorkspaceHeader.tsx`,
  `WorkspaceGrid.tsx`; `globals.css` (`ws-/wsh-/wsg-`); add `.shell-content`
  workspace modifier per Part D (behind the modifier; legacy unaffected).
- *Dependencies:* Commits 1–2.
- *Validation:* Build passes; legacy pages unchanged (modifier not applied yet).
- *Rollback:* Remove files + CSS + modifier.

**Commit 4 — Inspector, StickyActionBar, Tabs, KpiRibbon**
- *Objective:* `InspectorPanel`, `StickyActionBar`, `Tabs`, `KpiRibbon` + CSS.
- *Files:* four components under `components/workspace/`; `globals.css`.
- *Dependencies:* Commits 1–3.
- *Validation:* Build passes; isolated render; no route consumes yet.
- *Rollback:* Remove files + CSS.

**Commit 5 — DataTable (v1: pagination)**
- *Objective:* `DataTable` with sticky sortable header, sub-line cells, status pills,
  inline actions, density, real pagination.
- *Files:* `components/workspace/table/DataTable.tsx` (+ types); `globals.css`
  (`dt-*`).
- *Dependencies:* Commits 1–2.
- *Validation:* Build passes; isolated render with sample rows; sort/select/paginate
  work; a11y (th scope, aria-sort) present.
- *Rollback:* Remove files + CSS.

**Commit 6 — SplitPane**
- *Objective:* `SplitPane` (horizontal, optional resizable + persistence).
- *Files:* `components/workspace/SplitPane.tsx`; `globals.css` (`split-*`).
- *Dependencies:* Commit 3.
- *Validation:* Build passes; isolated render; keyboard resize works when resizable.
- *Rollback:* Remove files + CSS.

**Commit 7 — Guidebooks migration (reference implementation)**
- *Objective:* Re-implement `/guidebooks` on the primitives; **delete 196px offset**.
- *Files:* `app/(app)/guidebooks/page.tsx`; `components/guidebooks/*` (compose
  primitives; keep data/handlers); apply `.shell-content` workspace modifier for this
  route; remove `gb-workspace`/`gb-*` layout CSS it no longer uses.
- *Dependencies:* Commits 1–4.
- *Validation:* Build; page fits viewport; only list/detail scroll; `?g=` deep-link
  works; Edit/Save behavior unchanged.
- *Rollback:* `git revert` — self-contained page + its CSS; other pages unaffected.

**Commit 8 — Collapsible sidebar**
- *Objective:* expanded/collapsed/hover states, persistence, default rule, badges.
- *Files:* `components/shell/Sidebar.tsx`, `AppShell.tsx`; `globals.css`
  (`shell-sidebar` states); token widths.
- *Dependencies:* Commit 1.
- *Validation:* Build; toggle + `[` shortcut; hover overlay doesn't reflow workspace;
  persisted; all pages still navigable.
- *Rollback:* Revert; sidebar returns to static 224px.

**Commit 9 — Dashboard migration (KPI ribbon + table + inspector)**
- *Objective:* Rebuild `/dashboard` as the reference exemplar.
- *Files:* `app/(app)/dashboard/page.tsx`; `components/dashboard/*` (compose
  primitives; keep widget registry + data); `globals.css` cleanup of `dash-*` layout.
- *Dependencies:* Commits 1–5, 7.
- *Validation:* Build; matches reference structure; only table/feed scroll; Studio
  edit mode + widget data preserved.
- *Rollback:* `git revert` (self-contained).

**Commit 10 — Consultation migration (flagship)**
- *Objective:* Rebuild consult page with SplitPane + tabbed inspector + sticky bar;
  **delete 130px offset.**
- *Files:* `app/(app)/worklist/[id]/consult/page.tsx`; `components/consultation/*`
  (compose; keep call lifecycle, auto-save, wizard, outcome dialog);
  `components/care-plan/CarePlanPanel.tsx` (as inspector tab); `globals.css` cleanup
  (`cw-*`).
- *Dependencies:* Commits 1–6.
- *Validation:* Build; call/auto-save/wizard/outcome all work; Complete always
  visible; `?returnUrl=` preserved; panes scroll independently.
- *Rollback:* `git revert` (self-contained page).

**Commit 11 — Worklist migration (table-primary + inspector)**
- *Objective:* `/worklist` on `DataTable` + `InspectorPanel`; real pagination.
- *Files:* `app/(app)/worklist/page.tsx`; `components/worklist/*`; `globals.css`
  (`wl-*`).
- *Dependencies:* Commits 1–5.
- *Validation:* Build; row→inspector; Open→consult; sort/paginate; filters preserved.
- *Rollback:* `git revert`.

**Commit 12 — Citizens migration (timeline into inspector)**
- *Objective:* `/citizens` on primitives; move `PatientTimeline` into inspector tabs;
  **delete 102px offset.**
- *Files:* `app/(app)/citizens/page.tsx`; `components/citizens/*`; `globals.css`
  (`cz-*`).
- *Dependencies:* Commits 1–5.
- *Validation:* Build; three columns fit; `?c=` deep-link; dialogs; no trailing
  timeline; profile/journey as inspector tabs.
- *Rollback:* `git revert`.

**Commit 13 — Notifications migration**
- *Objective:* `/notifications` table-primary + inspector.
- *Files:* `app/(app)/notifications/page.tsx`; `globals.css` (`notif-*`).
- *Dependencies:* Commits 1–5.
- *Validation:* Build; select→detail; resolve; bell "View all" deep-link.
- *Rollback:* `git revert`.

**Commit 14 — Knowledge + Training migration**
- *Objective:* `/knowledge-base` list-detail with Tabs; Training rides it.
- *Files:* `app/(app)/knowledge-base/page.tsx`; `components/knowledge/*`;
  `globals.css` (`kh-*`).
- *Dependencies:* Commits 1–5.
- *Validation:* Build; tabs; search→reading pane; deep-links.
- *Rollback:* `git revert`.

**Commit 15 — Administration migration**
- *Objective:* Admin workspace (nav list + tool panel); sub-routes render within.
- *Files:* `app/(app)/administration/page.tsx` + sub-page files;
  `components/dataquality/*`, `workflow/*` (wrap, unchanged behavior); `globals.css`.
- *Dependencies:* Commits 1–5.
- *Validation:* Build; each sub-tool works and is still route-addressable.
- *Rollback:* `git revert`.

**Commit 16 — Reports migration (section rail + lazy charts)**
- *Objective:* `/reports` section-nav + pinned filters + lazy chart canvas.
- *Files:* `app/(app)/reports/page.tsx`; `components/analytics/*`; `globals.css`
  (`rp-*`).
- *Dependencies:* Commits 1–5.
- *Validation:* Build; section switch (no long scroll); filters sticky; export works;
  charts lazy-mount.
- *Rollback:* `git revert`.

**Commit 17 — Care Plan standalone workspace** (if a standalone route is desired)
- *Objective:* Standalone Care Plan workspace using the embedded components.
- *Files:* `components/care-plan/*` (+ route if introduced).
- *Dependencies:* Commits 1–5.
- *Validation:* Build; goals/inspector scroll; save; APIs preserved.
- *Rollback:* `git revert`.

**Commit 18 — DataTable v2 (virtualization) + table adoption cleanup**
- *Objective:* Add row virtualization for large sets; adopt in Data Quality/admin
  lists.
- *Files:* `DataTable.tsx`; adopting components.
- *Dependencies:* Commit 5 + relevant page commits.
- *Validation:* Build; large lists smooth; behavior parity.
- *Rollback:* `git revert` (virtualization behind a prop; pages fall back to paging).

**Commit 19 — Registry template** (gated; build the three pages only on approval)
- *Objective:* Shared Registry workspace; then Programs/Diseases/Outcome Templates.
- *Files:* `components/workspace/RegistryWorkspace.tsx`; page files when approved.
- *Dependencies:* Commits 1–5.
- *Validation:* Build; template renders; concrete pages gated behind approval.
- *Rollback:* `git revert`.

**Commit 20 — Shell cleanup + typography long-tail (Phase 9)**
- *Objective:* Set `.shell-content` to non-scrolling for all (now all pages are
  workspaces); remove dead legacy layout CSS; finish replacing residual hardcoded
  font sizes with tokens.
- *Files:* `globals.css`; `AppShell`/layout.
- *Dependencies:* All page commits (7, 9–17) complete.
- *Validation:* Build; **no page scroll anywhere**; grep shows no `calc(100vh`, no
  orphaned `*-workspace`/`.page` layout rules; font-size literals reduced to the
  agreed floor.
- *Rollback:* `git revert` (restores legacy branch; pages still work as workspaces).

---

## Part G — Definition of Done (milestone acceptance)

1. Every route in scope renders a single `Workspace`; **no `calc(100vh - Npx)`
   remains** (grep clean).
2. **No page/body scroll** on any page at 1280×800, 1440×900, 1536×864; only
   `PanelContent`/`DataTable`/`KpiRibbon` scroll.
3. All 12 primitives exist, are the sole layout mechanism, and are reused (no
   page-specific shells; no duplicated layout CSS).
4. Sidebar collapses/expands/hovers with persistence and default rule.
5. List modules (Dashboard, Worklist, Citizens, Notifications, Reports, Knowledge)
   are table/list-primary with adjacent `InspectorPanel`s — no separate detail pages.
6. Density is compact by default and switchable; tokens are the only source of
   spacing/type/radius/shadow/z.
7. **Zero functional regression:** routing, deep-links, permissions, dialogs, call
   lifecycle, auto-save, bell, dev switch, and all backend APIs behave exactly as
   before.
8. `cd frontend && npm run build` passes at every commit; `cd backend && npm run
   build` remains green (untouched).

---

## Part H — Resolved Decisions (developers do not choose)

| Item | Decision |
|---|---|
| CSS strategy | Plain global CSS + tokens + namespaced primitive classes. No Tailwind/CSS-Modules/CSS-in-JS. |
| Density default | **Compact**; comfortable/dense available via `data-density`. |
| Sidebar default | Expanded ≥1280px, auto-collapsed <1280px; persisted preference overrides. |
| List modules | Table/list-primary + adjacent `InspectorPanel`. No separate detail routes for detail views. |
| Global search | Out of scope for M27. `WorkspaceHeader` renders the existing (disabled) search unchanged; no new behavior. |
| SplitPane | Ships in M27; horizontal only; resizable used by Consultation (persisted), fixed elsewhere. |
| Config registries | Registry **template** built in M27; Programs/Diseases/Outcome Templates pages **gated** (built only on explicit approval). |
| Min supported width | 1024px is the "full workspace" floor; 768–1023 degrades via drawers; <768 single-column. |
| Reference conflicts | The `UI reference.png` wins on structure/density; DiNC brand (colors/icons/name) always wins on identity. |

---

*End of Milestone 27 Implementation Contract. This is the official, binding
specification. No code has been written or modified. Implementation is gated on
explicit approval.*
