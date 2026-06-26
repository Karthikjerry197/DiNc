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

// ── Citizen Workspace ────────────────────────────────────────────────────────

export interface CitizenListItem {
  id: string;
  uhid: string;
  fullName: string | null;
  age: number | null;
  gender: string | null;
  district: string | null;
}

export interface ProgramChip {
  id: string;
  name: string;
}

export interface EnrollmentInfo {
  service: string | null;
  event: string | null;
  condition: string | null;
  assignee: string | null;
  priority: string | null;
  status: string | null;
  reviewStatus: string | null;
  remarks: string | null;
}

export interface ActivityEntry {
  id: string;
  activity: string | null;
  program: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
}

export interface CompletionStats {
  total: number;
  completed: number;
  pending: number;
}

export interface CitizenDetail {
  citizen: {
    id: string;
    uhid: string;
    fullName: string | null;
    age: number | null;
    gender: string | null;
    phone: string | null;
    district: string | null;
  };
  programs: ProgramChip[];
  enrollment: EnrollmentInfo | null;
  activities: ActivityEntry[];
  stats: CompletionStats;
}

export async function fetchCitizensList(token: string): Promise<CitizenListItem[]> {
  const res = await fetch(`${API_BASE}/api/citizens/list`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load citizens');
  }
  return res.json() as Promise<CitizenListItem[]>;
}

export async function fetchCitizenDetail(token: string, id: string): Promise<CitizenDetail> {
  const res = await fetch(`${API_BASE}/api/citizens/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load citizen detail');
  }
  return res.json() as Promise<CitizenDetail>;
}

// ── Guidebooks ───────────────────────────────────────────────────────────────

export interface GuidebookListItem {
  id: string;
  code: string;
  category: string;
  title: string;
  summary: string | null;
  status: 'Active' | 'Inactive';
}

export interface GuidebookDetail {
  id: string;
  code: string;
  category: string;
  title: string;
  status: 'Active' | 'Inactive';
  updatedAt: string;
  summary: string | null;
  evidenceSource: string | null;
  keyRecommendations: string[];
  referralCriteria: string[];
}

export async function fetchGuidebooksList(token: string): Promise<GuidebookListItem[]> {
  const res = await fetch(`${API_BASE}/api/guidebooks/list`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load guidebooks');
  }
  return res.json() as Promise<GuidebookListItem[]>;
}

export async function fetchGuidebookDetail(token: string, id: string): Promise<GuidebookDetail> {
  const res = await fetch(`${API_BASE}/api/guidebooks/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load guidebook detail');
  }
  return res.json() as Promise<GuidebookDetail>;
}

// ── Programs & Enrollments (read layer) ──────────────────────────────────────

export interface ProgramDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface NamedRef {
  id: string | null;
  name: string | null;
}

export interface EnrollmentSummary {
  id: string;
  program: NamedRef;
  subProgram: NamedRef | null;
  enrollmentDate: string | null;
  status: string;
  priority: string | null;
  cphcService: string | null;
}

export interface EnrollmentDetail {
  id: string;
  citizen: { id: string | null; uhid: string | null };
  program: NamedRef;
  subProgram: NamedRef | null;
  condition: string | null;
  event: string | null;
  cphcService: string | null;
  assignee: string | null;
  priority: string | null;
  status: string | null;
  reviewStatus: string | null;
  remarks: string | null;
  enrollmentDate: string | null;
  geographicUnit: string | null;
  enrolledBy: string | null;
}

export async function fetchPrograms(token: string): Promise<ProgramDto[]> {
  const res = await fetch(`${API_BASE}/api/programs`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load programs');
  }
  return res.json() as Promise<ProgramDto[]>;
}

export async function fetchCitizenEnrollments(
  token: string,
  citizenId: string,
): Promise<EnrollmentSummary[]> {
  const res = await fetch(`${API_BASE}/api/citizens/${citizenId}/enrollments`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load enrollments');
  }
  return res.json() as Promise<EnrollmentSummary[]>;
}

export async function fetchEnrollmentDetail(
  token: string,
  id: string,
): Promise<EnrollmentDetail> {
  const res = await fetch(`${API_BASE}/api/enrollments/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load enrollment detail');
  }
  return res.json() as Promise<EnrollmentDetail>;
}
