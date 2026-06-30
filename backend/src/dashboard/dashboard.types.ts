/**
 * Shapes returned by the Administrator Dashboard summary endpoint.
 *
 * Every numeric field is `number | null`: a real count when the query succeeds,
 * or `null` when that particular widget's data is unavailable so the frontend can
 * render a professional empty state instead of inventing a value. No statistic is
 * ever fabricated — all values come from read-only SELECT queries on existing tables.
 */

export interface DashboardStats {
  registeredCitizens: number | null;
  activeEnrollments: number | null;
  totalEnrollments: number | null;
  programs: number | null;
  subPrograms: number | null;
  knowledgeAssets: number | null;
  cphcServices: number | null;
  pendingNotifications: number | null;
  pendingTasks: number | null;
  overdueTasks: number | null;
}

export interface WorklistBreakdown {
  pending: number | null;
  overdue: number | null;
  completed: number | null;
  /** Activities completed today (consultations closed today). */
  completedToday: number | null;
  /** Activities referred onward. */
  referred: number | null;
  /** Consultations recorded as "No Answer" today. */
  noAnswer: number | null;
  /** Activities flagged as emergency referrals. */
  emergencyReferrals: number | null;
}

export interface ServiceItem {
  name: string;
  icon: string | null;
  color: string | null;
}

/** A program with its active-enrollment count for the Programs Summary widget. */
export interface ProgramSummaryItem {
  name: string;
  activeEnrollments: number;
}

export interface ActivityItem {
  kind: string;
  title: string;
  subtitle: string;
  at: string;
}

export interface WorklistRow {
  uhid: string | null;
  citizen: string | null;
  activity: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
}

export interface AdminDashboardSummary {
  stats: DashboardStats;
  worklist: WorklistBreakdown;
  services: ServiceItem[];
  programs: ProgramSummaryItem[];
  recentActivity: ActivityItem[];
  recentWorklist: WorklistRow[];
}

// ── Dashboard Layout ──────────────────────────────────────────────────────────

/** One widget slot in a role layout — mirrors the frontend StudioLayoutItem. */
export interface LayoutItem {
  widgetId: string;
  visible: boolean;
  collapsed: boolean;
  /** Grid column span 1–3. Optional for backward compatibility with saved rows. */
  colSpan?: number;
}

export interface DashboardLayoutDto {
  role: string;
  layout: LayoutItem[];
  updatedBy: string | null;
  updatedAt: string | null;
}
