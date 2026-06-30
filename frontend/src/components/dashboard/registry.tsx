'use client';

/**
 * Widget Registry — the single authoritative source for every Dashboard Studio widget.
 *
 * To add a widget from any future module:
 *   1. Create the widget component anywhere in the codebase.
 *   2. Import it here and add one entry to WIDGET_REGISTRY.
 *   3. Set defaultForRoles to control which roles see it by default.
 *   4. No other file needs to change — Studio, types, and backend are untouched.
 *
 * Dashboard Studio never imports widget components directly.
 * It renders widgets by calling WIDGET_REGISTRY[id].render(props) dynamically.
 */

import { type ReactNode } from 'react';
import type { ColSpan, StudioLayoutItem, WidgetMeta } from './dashboard.types';
import type { AdminDashboardSummary, DashboardLayoutItem, WorklistItem } from '@/lib/api';
import type { ReportDuplicateTarget } from '@/components/dataquality/ReportDuplicateDialog';

import QuickActionsWidget from './widgets/QuickActionsWidget';
import KpiWidget          from './widgets/KpiWidget';
import WorklistWidget     from './widgets/WorklistWidget';
import ProgramsWidget     from './widgets/ProgramsWidget';
import ServicesWidget     from './widgets/ServicesWidget';
import ActivityWidget     from './widgets/ActivityWidget';
import StatCardWidget     from './widgets/StatCardWidget';

// ── Render-props contract ─────────────────────────────────────────────────────

/** All dashboard-level context passed to every widget's render function. */
export interface WidgetRenderProps {
  data: AdminDashboardSummary | null;
  worklistItems: WorklistItem[];
  onLoad: () => void;
  onFlash: (msg: string) => void;
  onConsult: (activityId: string) => void;
  onDuplicate: (target: ReportDuplicateTarget) => void;
}

// ── Widget definition ─────────────────────────────────────────────────────────

interface RoleSlot {
  /** Ascending sort order within this role's default layout. */
  order: number;
  /** Optional colSpan override for this role (falls back to defaultColSpan). */
  colSpan?: ColSpan;
}

export interface WidgetDefinition extends WidgetMeta {
  /**
   * Per-role default placement.
   * A role key present here means the widget appears in that role's built-in
   * layout at the given order. Absent = not in default but addable via Library.
   */
  defaultForRoles?: Partial<Record<string, RoleSlot>>;

  /**
   * Optional role allowlist for Widget Library visibility.
   * When set, only listed roles can see and add this widget.
   * Omit to allow all roles.
   * Independent of defaultForRoles — a widget can be permitted to a role
   * without being in its default layout, and vice-versa for admin-only widgets.
   */
  permissions?: string[];

  /** Returns the widget's content given dashboard-level context. */
  render: (props: WidgetRenderProps) => ReactNode;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {

  // ── Operations ──────────────────────────────────────────────────────────────

  'quick-actions': {
    id:           'quick-actions',
    label:        'Quick Actions',
    description:  'Frequently used operational shortcuts',
    icon:         '⚡',
    category:     'Operations',
    defaultColSpan: 1,
    defaultForRoles: {
      ADMIN:          { order: 5 },
      CLINICIAN:      { order: 3 },
      CARE_ASSISTANT: { order: 0 },
      ANM:            { order: 0 },
    },
    render: ({ onLoad, onFlash }) => (
      <QuickActionsWidget onChanged={onLoad} onToast={onFlash} />
    ),
  },

  'worklist': {
    id:           'worklist',
    label:        "Today's Worklist",
    description:  "Active worklist items, overdue tasks, and today's consultations",
    icon:         '📋',
    category:     'Operations',
    defaultColSpan: 2,
    defaultForRoles: {
      ADMIN:          { order: 6,  colSpan: 2 },
      CLINICIAN:      { order: 0,  colSpan: 3 },
      CARE_ASSISTANT: { order: 1,  colSpan: 2 },
      ANM:            { order: 3,  colSpan: 2 },
    },
    render: ({ data, worklistItems, onFlash, onConsult, onDuplicate }) => (
      <WorklistWidget
        worklist={data?.worklist}
        items={worklistItems}
        onFlash={onFlash}
        onConsult={onConsult}
        onDuplicate={(cid, uhid, name) => onDuplicate({ id: cid, uhid, fullName: name })}
      />
    ),
  },

  'activity': {
    id:           'activity',
    label:        'Recent Activity',
    description:  'Latest system activity across all modules',
    icon:         '🕐',
    category:     'Operations',
    defaultColSpan: 1,
    defaultForRoles: {
      ADMIN: { order: 9 },
      ANM:   { order: 5 },
    },
    render: ({ data }) => (
      <ActivityWidget activity={data?.recentActivity ?? []} />
    ),
  },

  // ── Analytics ─────────────────────────────────────────────────────────────

  'kpi-cards': {
    id:           'kpi-cards',
    label:        'Key Indicators',
    description:  'At-a-glance overview of all operational KPIs in one panel',
    icon:         '📊',
    category:     'Analytics',
    defaultColSpan: 1,
    defaultForRoles: {
      ADMIN: { order: 10 },
    },
    render: ({ data }) => <KpiWidget stats={data?.stats} />,
  },

  'stat-citizens': {
    id:           'stat-citizens',
    label:        'Registered Citizens',
    description:  'Total registered citizens in the system',
    icon:         '👥',
    category:     'Analytics',
    defaultColSpan: 1,
    defaultForRoles: {
      ADMIN: { order: 0 },
      ANM:   { order: 2 },
    },
    render: ({ data }) => (
      <StatCardWidget
        value={data?.stats.registeredCitizens}
        label="Registered Citizens"
        icon="👥"
        color="blue"
      />
    ),
  },

  'stat-enrollments': {
    id:           'stat-enrollments',
    label:        'Active Enrolments',
    description:  'Citizens currently enrolled in active programmes',
    icon:         '📝',
    category:     'Analytics',
    defaultColSpan: 1,
    defaultForRoles: {
      ADMIN: { order: 1 },
      ANM:   { order: 4 },
    },
    render: ({ data }) => (
      <StatCardWidget
        value={data?.stats.activeEnrollments}
        label="Active Enrolments"
        icon="📝"
        color="green"
      />
    ),
  },

  'stat-programs': {
    id:           'stat-programs',
    label:        'Programmes',
    description:  'Total active health programmes',
    icon:         '🏥',
    category:     'Analytics',
    defaultColSpan: 1,
    defaultForRoles: {
      ADMIN: { order: 2 },
    },
    render: ({ data }) => (
      <StatCardWidget
        value={data?.stats.programs}
        label="Programmes"
        icon="🏥"
        color="purple"
      />
    ),
  },

  'stat-tasks': {
    id:           'stat-tasks',
    label:        'Pending Tasks',
    description:  'Open worklist items awaiting action',
    icon:         '⏳',
    category:     'Analytics',
    defaultColSpan: 1,
    defaultForRoles: {
      ADMIN:          { order: 3 },
      CLINICIAN:      { order: 1 },
      CARE_ASSISTANT: { order: 2 },
    },
    render: ({ data }) => (
      <StatCardWidget
        value={data?.stats.pendingTasks}
        label="Pending Tasks"
        icon="⏳"
        color="amber"
      />
    ),
  },

  'stat-overdue': {
    id:           'stat-overdue',
    label:        'Overdue Tasks',
    description:  'Tasks that have passed their due date',
    icon:         '⚠️',
    category:     'Analytics',
    defaultColSpan: 1,
    defaultForRoles: {
      ADMIN:     { order: 4 },
      CLINICIAN: { order: 2 },
    },
    render: ({ data }) => (
      <StatCardWidget
        value={data?.stats.overdueTasks}
        label="Overdue"
        icon="⚠️"
        color="red"
      />
    ),
  },

  // ── Clinical ─────────────────────────────────────────────────────────────

  'programs': {
    id:           'programs',
    label:        'Programme Summary',
    description:  'Enrolment breakdown by active programme',
    icon:         '🗂️',
    category:     'Clinical',
    defaultColSpan: 1,
    defaultForRoles: {
      ADMIN:     { order: 7 },
      CLINICIAN: { order: 4 },
      ANM:       { order: 6 },
    },
    render: ({ data }) => (
      <ProgramsWidget programs={data?.programs ?? []} />
    ),
  },

  // ── Administration ───────────────────────────────────────────────────────

  'services': {
    id:           'services',
    label:        'CPHC Services',
    description:  'Available CPHC service categories and shortcuts',
    icon:         '🏛️',
    category:     'Administration',
    defaultColSpan: 1,
    defaultForRoles: {
      ADMIN: { order: 8 },
    },
    render: ({ data }) => (
      <ServicesWidget services={data?.services ?? []} />
    ),
  },

};

export default WIDGET_REGISTRY;

// ── Public utilities ──────────────────────────────────────────────────────────

/**
 * Derives the built-in default layout for a role from each widget's
 * defaultForRoles. Called when PostgreSQL has no saved row for the role.
 * No widget IDs are hardcoded outside this file.
 */
export function getDefaultLayout(role: string): StudioLayoutItem[] {
  return Object.values(WIDGET_REGISTRY)
    .filter((def) => def.defaultForRoles?.[role] !== undefined)
    .sort((a, b) =>
      a.defaultForRoles![role]!.order - b.defaultForRoles![role]!.order,
    )
    .map((def) => ({
      widgetId:  def.id,
      colSpan:   (def.defaultForRoles![role]?.colSpan ?? def.defaultColSpan) as ColSpan,
      visible:   true,
      collapsed: false,
    }));
}

/**
 * Normalises a raw layout loaded from PostgreSQL.
 * Rows saved before Dashboard Studio lack colSpan; this fills it from the
 * widget's registry default (or 1 for unrecognised widgets), ensuring full
 * backward compatibility with every existing saved layout.
 */
export function normaliseLayout(raw: DashboardLayoutItem[]): StudioLayoutItem[] {
  return raw.map((item) => ({
    widgetId:  item.widgetId,
    visible:   item.visible,
    collapsed: item.collapsed,
    colSpan:   ((item.colSpan ??
      WIDGET_REGISTRY[item.widgetId]?.defaultColSpan ??
      1) as ColSpan),
  }));
}
