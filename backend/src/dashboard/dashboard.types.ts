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
}

export interface ServiceItem {
  name: string;
  icon: string | null;
  color: string | null;
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
  recentActivity: ActivityItem[];
  recentWorklist: WorklistRow[];
}
