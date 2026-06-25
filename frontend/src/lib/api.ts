const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export interface AuthUser {
  username: string;
  full_name: string;
  role: string;
}

export interface LoginResponse extends AuthUser {
  token: string;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw new Error('Invalid username or password');
  }
  return res.json() as Promise<LoginResponse>;
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Session is no longer valid');
  }
  return res.json() as Promise<AuthUser>;
}

// ── Dashboard ──────────────────────────────────────────────────────────────

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

export async function fetchAdminDashboard(token: string): Promise<AdminDashboardSummary> {
  const res = await fetch(`${API_BASE}/api/dashboard/admin/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load dashboard data');
  }
  return res.json() as Promise<AdminDashboardSummary>;
}

// ── Worklist ─────────────────────────────────────────────────────────────────

export interface WorklistStats {
  total: number | null;
  pending: number | null;
  overdue: number | null;
  dueToday: number | null;
  completed: number | null;
  escalations: number | null;
}

export interface WorklistItem {
  id: string;
  uhid: string | null;
  citizen: string | null;
  program: string | null;
  subProgram: string | null;
  activity: string | null;
  type: string | null;
  dueDate: string | null;
  reminders: number;
  priority: string;
  isEscalation: boolean;
  status: string;
  assignedTo: string | null;
}

export interface ProgramOption {
  id: string;
  name: string;
}

export interface AssigneeOption {
  username: string;
  fullName: string;
}

export interface MonitoringEntry {
  username: string;
  fullName: string;
  role: string;
  pending: number;
}

export interface WorklistOverview {
  stats: WorklistStats;
  items: WorklistItem[];
  programs: ProgramOption[];
  assignees: AssigneeOption[];
  monitoring: MonitoringEntry[];
}

export async function fetchWorklistOverview(token: string): Promise<WorklistOverview> {
  const res = await fetch(`${API_BASE}/api/worklist/admin/overview`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load worklist data');
  }
  return res.json() as Promise<WorklistOverview>;
}
