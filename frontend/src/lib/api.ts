// Base URL of the backend API.
// 1. Preferred: set NEXT_PUBLIC_API_BASE_URL in frontend/.env.local
//    (e.g. http://192.168.31.44:4000) so LAN clients reach the server host.
// 2. If unset, fall back to the host the browser loaded the app from — this
//    keeps LAN access working (a client at http://192.168.31.44:3000 will call
//    http://192.168.31.44:4000) instead of pointing 'localhost' at the client.
// 3. On the server (SSR/build) where there is no window, use localhost.
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : 'http://localhost:4000');

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
  completedToday: number | null;
  referred: number | null;
  noAnswer: number | null;
  emergencyReferrals: number | null;
}

/** Population-level clinical risk counts (M32), derived from CDSE clinical_alerts. */
export interface RiskBreakdown {
  low: number | null;
  moderate: number | null;
  severe: number | null;
}

export interface ServiceItem {
  name: string;
  icon: string | null;
  color: string | null;
}

export interface ProgramSummaryItem {
  name: string;
  /** Programme colour indicator (hex) from PostgreSQL; null when unset. */
  color: string | null;
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
  risk: RiskBreakdown;
  services: ServiceItem[];
  programs: ProgramSummaryItem[];
  recentActivity: ActivityItem[];
  recentWorklist: WorklistRow[];
}

// ── Dashboard Layout ──────────────────────────────────────────────────────────

export interface DashboardLayoutItem {
  widgetId: string;
  visible: boolean;
  collapsed: boolean;
  /** Grid column span (1–3). Optional; absent on layouts saved before Dashboard Studio. */
  colSpan?: number;
}

export interface DashboardLayoutResponse {
  role: string;
  layout: DashboardLayoutItem[];
  updatedBy: string | null;
  updatedAt: string | null;
}

/** Fetch the layout for the current user's role.
 *  Admins may pass an optional `role` to fetch another role's layout for editing. */
export async function fetchDashboardLayout(
  token: string,
  role?: string,
): Promise<DashboardLayoutResponse> {
  const url = role
    ? `${API_BASE}/api/dashboard/layout?role=${encodeURIComponent(role)}`
    : `${API_BASE}/api/dashboard/layout`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Failed to load dashboard layout');
  return res.json() as Promise<DashboardLayoutResponse>;
}

// ── Dev user switching ────────────────────────────────────────────────────────
// These functions call dev-only backend endpoints that bypass password checks.
// They are used exclusively by the Switch User development feature.

export interface DevUser {
  username: string;
  full_name: string;
  role: string;
}

/** Returns all active users in the system — populates the Switch User menu. */
export async function fetchDevUsers(token: string): Promise<DevUser[]> {
  const res = await fetch(`${API_BASE}/api/auth/dev/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch dev users.');
  return res.json() as Promise<DevUser[]>;
}

/**
 * Issues a real JWT for the target user without requiring their password.
 * Returns the same shape as login — a complete new session for the switched user.
 */
export async function devSwitchUser(
  token: string,
  targetUsername: string,
): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/dev/switch-user`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username: targetUsername }),
  });
  if (!res.ok) throw new Error(`Failed to switch to user '${targetUsername}'.`);
  return res.json() as Promise<LoginResponse>;
}

/** Change the current user's password. Throws on wrong current password or other error. */
export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    let message = 'Failed to change password.';
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message) {
        message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
      }
    } catch { /* keep default */ }
    throw new Error(message);
  }
}

/** Persist a role's layout. Admin-only on the backend. */
export async function saveDashboardLayout(
  token: string,
  role: string,
  layout: DashboardLayoutItem[],
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/dashboard/layout`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role, layout }),
  });
  if (!res.ok) throw new Error('Failed to save dashboard layout');
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
  citizenId: string | null;
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
  /** Clinical risk level from active alerts. Null means NONE. */
  riskLevel: string | null;
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
  /** Enrollment aggregates + severest active alert, for list filtering (M33.1). */
  programs: string[];
  diseases: string[];
  statuses: string[];
  workers: string[];
  riskLevel: string | null;
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

// ── Patient registration & bulk upload (single shared workflow) ──────────────

export interface CreateCitizenPayload {
  uhid: string;
  fullName: string;
  age?: number;
  gender?: string;
  phone?: string;
  district?: string;
}

export interface BulkUploadResult {
  total: number;
  created: number;
  skipped: number;
  errors: { uhid: string | null; reason: string }[];
}

export async function createCitizen(
  token: string,
  payload: CreateCitizenPayload,
): Promise<CitizenListItem> {
  const res = await fetch(`${API_BASE}/api/citizens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to register patient.');
  return res.json() as Promise<CitizenListItem>;
}

export async function bulkUploadCitizens(
  token: string,
  patients: CreateCitizenPayload[],
): Promise<BulkUploadResult> {
  const res = await fetch(`${API_BASE}/api/citizens/bulk`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ patients }),
  });
  if (!res.ok) throw await readError(res, 'Unable to upload patients.');
  return res.json() as Promise<BulkUploadResult>;
}

// ── Integrated registration (wizard + bulk with enrollment) ──────────────────

export interface RegistrationProgramOption {
  id: string;
  code: string;
  name: string;
}
export interface RegistrationWorkerOption {
  username: string;
  fullName: string;
  role: string;
}
export interface RegistrationOptions {
  programs: RegistrationProgramOption[];
  workers: RegistrationWorkerOption[];
}

export interface DuplicateMatch {
  id: string;
  uhid: string;
  fullName: string | null;
  phone: string | null;
  matchedOn: ('UHID' | 'PHONE' | 'AADHAAR')[];
}

export interface RegisterPatientPayload {
  uhid?: string;
  fullName: string;
  age?: number;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  address?: string;
  village?: string;
  district?: string;
  aadhaar?: string;
  programIds: string[];
  assignedTo?: string;
  force?: boolean;
}

export interface RegistrationResult {
  citizenId: string;
  uhid: string;
  fullName: string | null;
  enrollments: { programId: string; programName: string; enrollmentId: string; activityId: string | null }[];
  skippedPrograms: string[];
}

export interface BulkPatientRow {
  uhid?: string;
  fullName: string;
  age?: string;
  gender?: string;
  phone?: string;
  address?: string;
  village?: string;
  district?: string;
  aadhaar?: string;
  programs?: string;
}

export interface BulkRowResult {
  row: number;
  uhid: string | null;
  fullName: string | null;
  status: 'CREATED' | 'DUPLICATE' | 'SKIPPED' | 'FAILED';
  enrollments: number;
  reason: string | null;
}

export interface BulkRegistrationResult {
  total: number;
  created: number;
  duplicate: number;
  skipped: number;
  failed: number;
  rows: BulkRowResult[];
}

export async function fetchRegistrationOptions(token: string): Promise<RegistrationOptions> {
  const res = await fetch(`${API_BASE}/api/registration/options`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load registration options.');
  return res.json() as Promise<RegistrationOptions>;
}

export async function checkDuplicates(
  token: string,
  payload: { uhid?: string; phone?: string; aadhaar?: string },
): Promise<{ duplicates: DuplicateMatch[] }> {
  const res = await fetch(`${API_BASE}/api/registration/check-duplicates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to check for duplicates.');
  return res.json() as Promise<{ duplicates: DuplicateMatch[] }>;
}

export async function registerPatient(
  token: string,
  payload: RegisterPatientPayload,
): Promise<RegistrationResult> {
  const res = await fetch(`${API_BASE}/api/registration`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to register patient.');
  return res.json() as Promise<RegistrationResult>;
}

export async function bulkRegisterPatients(
  token: string,
  payload: { patients: BulkPatientRow[]; defaultProgramIds?: string[]; assignedTo?: string },
): Promise<BulkRegistrationResult> {
  const res = await fetch(`${API_BASE}/api/registration/bulk`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to bulk register patients.');
  return res.json() as Promise<BulkRegistrationResult>;
}

// ── Scheduler & Automation Engine (Administration) ───────────────────────────

export interface SchedulerRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: 'AUTO' | 'MANUAL';
  dueFound: number;
  rulesProcessed: number;
  activitiesCreated: number;
  retries: number;
  escalations: number;
  failures: number;
  error: string | null;
}

export interface SchedulerStatus {
  enabled: boolean;
  intervalMs: number;
  lastRun: SchedulerRun | null;
  nextRunEstimate: string | null;
  recentRuns: SchedulerRun[];
  totals: {
    runs: number;
    activitiesCreated: number;
    retries: number;
    escalations: number;
    failures: number;
  };
}

export async function fetchSchedulerStatus(token: string): Promise<SchedulerStatus> {
  const res = await fetch(`${API_BASE}/api/scheduler/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load scheduler status.');
  return res.json() as Promise<SchedulerStatus>;
}

export async function runSchedulerNow(token: string): Promise<SchedulerRun> {
  const res = await fetch(`${API_BASE}/api/scheduler/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw await readError(res, 'Unable to run the scheduler.');
  return res.json() as Promise<SchedulerRun>;
}

// ── System Settings (read-only admin view over existing configuration) ───────

export interface SystemSettings {
  organization: {
    name: string;
    facility: string | null;
    district: string | null;
    contactEmail: string | null;
  };
  application: {
    name: string;
    version: string;
    environment: string;
  };
  security: {
    sessionLifetime: string;
    passwordMinLength: number;
  };
}

export async function fetchSystemSettings(token: string): Promise<SystemSettings> {
  const res = await fetch(`${API_BASE}/api/system-settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load system settings.');
  return res.json() as Promise<SystemSettings>;
}

// ── Knowledge Hub (FAQ, Training, Emergency, Search) ─────────────────────────

export interface KnowledgeFaq {
  id: string;
  category: string | null;
  question: string;
  answer: string;
}
export interface CategoryCount {
  name: string;
  count: number;
}
export interface FaqList {
  faqs: KnowledgeFaq[];
  categories: CategoryCount[];
}
export interface TrainingModule {
  id: string;
  code: string;
  title: string;
  category: string | null;
  description: string | null;
  durationMinutes: number | null;
  content: string | null;
}
export interface EmergencyProtocol {
  id: string;
  code: string;
  category: string;
  title: string;
  recognition: string | null;
  immediateManagement: string[];
  referralCriteria: string[];
  notes: string | null;
}
export interface KnowledgeSearchHit {
  id: string;
  title: string;
  snippet: string | null;
  category: string | null;
}
export interface KnowledgeSearchResult {
  query: string;
  faqs: KnowledgeSearchHit[];
  training: KnowledgeSearchHit[];
  guidebooks: KnowledgeSearchHit[];
}
export interface FaqPayload {
  question: string;
  answer: string;
  category?: string;
}

export async function fetchFaqs(token: string): Promise<FaqList> {
  const res = await fetch(`${API_BASE}/api/knowledge/faqs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load FAQs.');
  return res.json() as Promise<FaqList>;
}

export async function createFaq(token: string, payload: FaqPayload): Promise<KnowledgeFaq> {
  const res = await fetch(`${API_BASE}/api/knowledge/faqs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to create FAQ.');
  return res.json() as Promise<KnowledgeFaq>;
}

export async function updateFaq(token: string, id: string, payload: FaqPayload): Promise<KnowledgeFaq> {
  const res = await fetch(`${API_BASE}/api/knowledge/faqs/${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to update FAQ.');
  return res.json() as Promise<KnowledgeFaq>;
}

export async function deleteFaq(token: string, id: string): Promise<{ id: string; deleted: boolean }> {
  const res = await fetch(`${API_BASE}/api/knowledge/faqs/${id}/delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw await readError(res, 'Unable to delete FAQ.');
  return res.json() as Promise<{ id: string; deleted: boolean }>;
}

export async function fetchTrainingModules(token: string): Promise<TrainingModule[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/training`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load training modules.');
  return res.json() as Promise<TrainingModule[]>;
}

export async function fetchEmergencyProtocols(token: string): Promise<EmergencyProtocol[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/emergency`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load emergency protocols.');
  return res.json() as Promise<EmergencyProtocol[]>;
}

export async function searchKnowledge(token: string, q: string): Promise<KnowledgeSearchResult> {
  const res = await fetch(`${API_BASE}/api/knowledge/search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to search knowledge.');
  return res.json() as Promise<KnowledgeSearchResult>;
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

/**
 * Data-driven section map from guidebook_sections JSONB.
 * Keys are arbitrary (e.g. "checklist", "counsellingPoints", "drugChart").
 * Values are text strings or ordered lists. The renderer displays whatever
 * keys exist — no frontend changes needed when new sections are added.
 */
export type GuidebookSections = Record<string, string | string[]>;

export interface GuidebookDetail {
  id: string;
  code: string;
  category: string;
  title: string;
  status: 'Active' | 'Inactive';
  updatedAt: string;
  /** Current version number, or null when unversioned. */
  version: number | null;
  summary: string | null;
  evidenceSource: string | null;
  keyRecommendations: string[];
  referralCriteria: string[];
  /** Structured sections from guidebook_sections JSONB (16A+). Empty object on legacy rows. */
  sections: GuidebookSections;
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

export interface ImportGuidebookPayload {
  code: string;
  category: string;
  title: string;
  source?: string;
  isActive?: boolean;
  sections: Record<string, string | string[]>;
}

/** Import a new guidebook from a validated JSON payload. Administrators only. */
export async function createGuidebook(
  token: string,
  payload: ImportGuidebookPayload,
): Promise<GuidebookListItem> {
  const res = await fetch(`${API_BASE}/api/guidebooks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to import the guidebook.');
  return res.json() as Promise<GuidebookListItem>;
}

/** Per-guidebook outcome for bulk import. */
export interface BulkGuidebookRowResult {
  row: number;
  code: string | null;
  title: string | null;
  status: 'CREATED' | 'DUPLICATE' | 'FAILED';
  reason: string | null;
}

export interface BulkGuidebookImportResult {
  total: number;
  created: number;
  duplicate: number;
  failed: number;
  rows: BulkGuidebookRowResult[];
}

/** Import many guidebooks in one request (per-row atomic). Administrators only. */
export async function bulkImportGuidebooks(
  token: string,
  guidebooks: ImportGuidebookPayload[],
): Promise<BulkGuidebookImportResult> {
  const res = await fetch(`${API_BASE}/api/guidebooks/bulk`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ guidebooks }),
  });
  if (!res.ok) throw await readError(res, 'Unable to import the guidebooks.');
  return res.json() as Promise<BulkGuidebookImportResult>;
}

/** One entry in a guidebook's version history. */
export interface GuidebookVersion {
  versionNumber: number;
  action: string;
  changedBy: string | null;
  changeSummary: string | null;
  createdAt: string;
}

export async function fetchGuidebookVersions(
  token: string,
  id: string,
): Promise<GuidebookVersion[]> {
  const res = await fetch(`${API_BASE}/api/guidebooks/${id}/versions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Unable to load version history');
  return res.json() as Promise<GuidebookVersion[]>;
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

// ── Context-aware guidebook resolution ───────────────────────────────────────

export interface GuidebookRef {
  id: string;
  code: string;
  category: string;
  title: string;
}

/**
 * Result of resolving the guidebook(s) for a clinical context. `guidebook` is
 * the highest-priority match to open automatically; `related` lists the other
 * applicable guidebooks; `message` is a display-ready explanation when nothing
 * is mapped (`matched === false`).
 */
export interface GuidebookResolution {
  guidebook: GuidebookRef | null;
  related: GuidebookRef[];
  matched: boolean;
  message: string | null;
}

/** Normalises any resolver response (tolerates older `{ guidebook }`-only bodies). */
function toGuidebookResolution(body: Partial<GuidebookResolution>): GuidebookResolution {
  const guidebook = body.guidebook ?? null;
  return {
    guidebook,
    related: Array.isArray(body.related) ? body.related : [],
    matched: body.matched ?? guidebook !== null,
    message: body.message ?? null,
  };
}

export async function fetchEnrollmentGuidebook(
  token: string,
  enrollmentId: string,
): Promise<GuidebookResolution> {
  const res = await fetch(`${API_BASE}/api/enrollments/${enrollmentId}/guidebook`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to resolve guidebook');
  }
  return toGuidebookResolution((await res.json()) as Partial<GuidebookResolution>);
}

export async function fetchWorklistItemGuidebook(
  token: string,
  itemId: string,
): Promise<GuidebookResolution> {
  const res = await fetch(`${API_BASE}/api/worklist/items/${itemId}/guidebook`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to resolve guidebook');
  }
  return toGuidebookResolution((await res.json()) as Partial<GuidebookResolution>);
}

/**
 * Builds the `/guidebooks` deep-link for a resolution: preselects the primary
 * guidebook and passes related ids so the page can show a "Related Guidebooks"
 * section. `activity` (a worklist item id) enables the Start-Call shortcut.
 */
export function guidebookHref(
  resolution: GuidebookResolution,
  activityId?: string | null,
): string {
  const params = new URLSearchParams();
  if (resolution.guidebook) params.set('g', resolution.guidebook.id);
  if (activityId) params.set('activity', activityId);
  const related = resolution.related.map((r) => r.id).filter(Boolean);
  if (related.length > 0) params.set('related', related.join(','));
  if (!resolution.matched) params.set('unmapped', '1');
  const qs = params.toString();
  return qs ? `/guidebooks?${qs}` : '/guidebooks';
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

export interface SubProgramOption {
  id: string;
  name: string;
}

export interface DiseaseOption {
  id: string;
  name: string;
}

export interface EventOption {
  id: string;
  name: string;
}

export interface CreateEnrollmentPayload {
  programId: string;
  diseaseId: string;
  eventId?: string;
  startDate: string;
  status?: string;
  remarks?: string;
  /** Care worker (username) responsible for this enrollment and its activities. */
  assignedTo?: string;
}

export interface CreateEnrollmentResult {
  enrollment: EnrollmentDetail;
  /** The activity auto-created for the selected event (null when no event). */
  activity: Activity | null;
}

export async function fetchSubPrograms(
  token: string,
  programId: string,
): Promise<SubProgramOption[]> {
  const res = await fetch(`${API_BASE}/api/programs/${programId}/sub-programs`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load sub-programs');
  }
  return res.json() as Promise<SubProgramOption[]>;
}

export async function fetchDiseases(
  token: string,
  subProgramId: string,
): Promise<DiseaseOption[]> {
  const res = await fetch(`${API_BASE}/api/sub-programs/${subProgramId}/diseases`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load conditions');
  }
  return res.json() as Promise<DiseaseOption[]>;
}

export async function fetchEvents(
  token: string,
  diseaseId: string,
): Promise<EventOption[]> {
  const res = await fetch(`${API_BASE}/api/diseases/${diseaseId}/events`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load events');
  }
  return res.json() as Promise<EventOption[]>;
}

// ── Activities (read layer) ──────────────────────────────────────────────────

export interface Activity {
  id: string;
  name: string | null;
  status: string;
  priority: string;
  assignedUser: string | null;
  assignedRole: string | null;
  dueDate: string | null;
  createdDate: string | null;
  completedDate: string | null;
  remarks: string | null;
  event: { id: string | null; name: string | null };
  enrollmentId: string | null;
}

export async function fetchEnrollmentActivities(
  token: string,
  enrollmentId: string,
): Promise<Activity[]> {
  const res = await fetch(`${API_BASE}/api/enrollments/${enrollmentId}/activities`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load activities');
  }
  return res.json() as Promise<Activity[]>;
}

export interface ActivityAssignee {
  username: string;
  fullName: string;
}

export interface ActivityOptions {
  defaultEventId: string | null;
  events: { id: string; name: string }[];
  assignees: ActivityAssignee[];
}

export interface CreateActivityPayload {
  eventId: string;
  dueDate: string;
  assignedTo?: string;
  priority?: string;
}

export async function fetchActivityOptions(
  token: string,
  enrollmentId: string,
): Promise<ActivityOptions> {
  const res = await fetch(`${API_BASE}/api/enrollments/${enrollmentId}/activity-options`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to load activity options');
  }
  return res.json() as Promise<ActivityOptions>;
}

/**
 * Creates an activity. On failure, surfaces the backend's validation message
 * (string or array) as a single friendly Error — never a stack trace.
 */
export async function createActivity(
  token: string,
  enrollmentId: string,
  payload: CreateActivityPayload,
): Promise<Activity> {
  const res = await fetch(`${API_BASE}/api/enrollments/${enrollmentId}/activities`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = 'Unable to create activity.';
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message) {
        message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
      }
    } catch {
      /* keep the default message */
    }
    throw new Error(message);
  }
  return res.json() as Promise<Activity>;
}

/**
 * Creates a program enrollment. On failure, surfaces the backend's validation
 * message (string or array) as a single friendly Error — never a stack trace.
 */
export async function createEnrollment(
  token: string,
  citizenId: string,
  payload: CreateEnrollmentPayload,
): Promise<CreateEnrollmentResult> {
  const res = await fetch(`${API_BASE}/api/citizens/${citizenId}/enrollments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = 'Unable to add program enrollment.';
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message) {
        message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
      }
    } catch {
      /* keep the default message */
    }
    throw new Error(message);
  }
  return res.json() as Promise<CreateEnrollmentResult>;
}

// ── Data Quality: Duplicate Requests ─────────────────────────────────────────

export type DuplicateRequestStatus =
  | 'PENDING'
  | 'REJECTED'
  | 'CLOSED'
  | 'CONFIRMED_DUPLICATE'
  | 'APPROVED'
  | 'RESOLVED';

/** The three Administrator Review decisions. */
export type DuplicateDecision =
  | 'REJECTED'
  | 'MULTIPLE_ENROLMENT'
  | 'CONFIRMED_DUPLICATE';

export type DuplicateResolution = 'MERGED' | 'DELETED';

export interface RequestCitizenRef {
  id: string;
  uhid: string | null;
  fullName: string | null;
}

export interface DuplicateRequest {
  id: string;
  reference: string;
  currentPatient: RequestCitizenRef;
  duplicatePatient: RequestCitizenRef;
  reason: string;
  comments: string | null;
  status: DuplicateRequestStatus;
  decision: DuplicateDecision | null;
  resolution: DuplicateResolution | null;
  submittedBy: string;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComments: string | null;
  remarks: string | null;
  updatedAt: string;
}

export interface EnrollmentComparisonEntry extends EnrollmentSummary {
  guidebook: GuidebookRef | null;
}

/** Extended demographics for the side-by-side comparison. */
export interface PatientDemographics {
  uhid: string | null;
  abha: string | null;
  aadhaar: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  age: number | null;
  gender: string | null;
  mobile: string | null;
  address: string | null;
  village: string | null;
  district: string | null;
}

/** An active clinical alert shown under Clinical Information. */
export interface AlertEntry {
  id: string;
  disease: string | null;
  riskLevel: string | null;
  status: string;
  triggeredAt: string | null;
}

export interface PatientComparisonSide {
  citizen: CitizenDetail['citizen'];
  demographics: PatientDemographics;
  programs: ProgramChip[];
  enrollments: EnrollmentComparisonEntry[];
  activities: ActivityEntry[];
  alerts: AlertEntry[];
  guidebooks: GuidebookRef[];
}

/** One entry in a request's append-only status timeline. */
export interface StatusHistoryEntry {
  id: string;
  fromStatus: DuplicateRequestStatus | null;
  toStatus: DuplicateRequestStatus;
  decision: DuplicateDecision | null;
  comments: string | null;
  actor: string | null;
  createdAt: string;
}

export interface DuplicateComparison {
  request: DuplicateRequest;
  current: PatientComparisonSide;
  duplicate: PatientComparisonSide;
  statusHistory: StatusHistoryEntry[];
}

/** Human labels for each status chip. */
export const DUPLICATE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending Admin Review',
  REJECTED: 'Rejected',
  CLOSED: 'Closed · Multiple Enrolment',
  CONFIRMED_DUPLICATE: 'Confirmed Duplicate',
  APPROVED: 'Approved',
  RESOLVED: 'Resolved',
};

/** Human labels for each review decision. */
export const DUPLICATE_DECISION_LABEL: Record<DuplicateDecision, string> = {
  REJECTED: 'Not a Duplicate',
  MULTIPLE_ENROLMENT: 'Valid Multiple Programme Enrolment',
  CONFIRMED_DUPLICATE: 'Confirmed Duplicate',
};

/**
 * OFFLINE FALLBACK ONLY for the duplicate-reason vocabulary (M40).
 *
 * The single source of truth is the `duplicate_reason` Reference Data category:
 * the Report Duplicate dialog reads it via `ReferenceSelect`, and the backend
 * validates against it. This list is used only if that API is momentarily
 * unavailable, and to label a stored reason code in tables. It is NOT
 * authoritative — do not add options here without adding them to Reference Data.
 */
export const DUPLICATE_REASON_FALLBACK: { value: string; label: string }[] = [
  { value: 'DUPLICATE_REGISTRATION', label: 'Duplicate registration' },
  { value: 'SAME_PERSON_DIFFERENT_UHID', label: 'Same person, different UHID' },
  { value: 'DATA_ENTRY_ERROR', label: 'Data entry error' },
  { value: 'MERGED_FAMILY_RECORD', label: 'Merged / family record' },
  { value: 'OTHER', label: 'Other' },
];

/** Maps a stored reason code to a friendly label (falls back to the code). */
export function duplicateReasonLabel(value: string): string {
  return DUPLICATE_REASON_FALLBACK.find((r) => r.value === value)?.label ?? value;
}

/** Surfaces a backend validation message (string | string[]) as one Error. */
async function readError(res: Response, fallback: string): Promise<Error> {
  let message = fallback;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (body?.message) {
      message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    }
  } catch {
    /* keep the fallback */
  }
  return new Error(message);
}

export interface CreateDuplicateRequestPayload {
  currentCitizenId: string;
  duplicateCitizenId: string;
  reason: string;
  comments?: string;
}

export async function createDuplicateRequest(
  token: string,
  payload: CreateDuplicateRequestPayload,
): Promise<DuplicateRequest> {
  const res = await fetch(`${API_BASE}/api/data-quality/duplicate-requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to submit duplicate request.');
  return res.json() as Promise<DuplicateRequest>;
}

export async function fetchDuplicateRequests(token: string): Promise<DuplicateRequest[]> {
  const res = await fetch(`${API_BASE}/api/data-quality/duplicate-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load duplicate requests.');
  return res.json() as Promise<DuplicateRequest[]>;
}

export async function fetchDuplicateComparison(
  token: string,
  id: string,
): Promise<DuplicateComparison> {
  const res = await fetch(
    `${API_BASE}/api/data-quality/duplicate-requests/${id}/comparison`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw await readError(res, 'Unable to load comparison.');
  return res.json() as Promise<DuplicateComparison>;
}

export async function reviewDuplicateRequest(
  token: string,
  id: string,
  decision: 'approve' | 'reject',
  remarks?: string,
): Promise<DuplicateRequest> {
  const res = await fetch(
    `${API_BASE}/api/data-quality/duplicate-requests/${id}/${decision}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(remarks ? { remarks } : {}),
    },
  );
  if (!res.ok) throw await readError(res, `Unable to ${decision} this request.`);
  return res.json() as Promise<DuplicateRequest>;
}

export async function resolveDuplicateRequest(
  token: string,
  id: string,
  action: 'MERGE' | 'DELETE',
  remarks?: string,
): Promise<DuplicateRequest> {
  const res = await fetch(
    `${API_BASE}/api/data-quality/duplicate-requests/${id}/resolve`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...(remarks ? { remarks } : {}) }),
    },
  );
  if (!res.ok) throw await readError(res, 'Unable to resolve this request.');
  return res.json() as Promise<DuplicateRequest>;
}

/**
 * Records an Administrator Review decision (Duplicate Review Workspace). Comments
 * are mandatory. A CONFIRMED_DUPLICATE only marks intent — nothing is merged,
 * archived or deleted (that is a future milestone).
 */
export async function decideDuplicateRequest(
  token: string,
  id: string,
  decision: DuplicateDecision,
  comments: string,
): Promise<DuplicateRequest> {
  const res = await fetch(
    `${API_BASE}/api/data-quality/duplicate-requests/${id}/decision`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, comments }),
    },
  );
  if (!res.ok) throw await readError(res, 'Unable to record this decision.');
  return res.json() as Promise<DuplicateRequest>;
}

// ── Reference Data (generic business vocabularies) ───────────────────────────

export interface ReferenceCategory {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  displayOrder: number;
  valueCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceValue {
  id: string;
  categoryId: string;
  categoryKey: string;
  code: string;
  displayName: string;
  description: string | null;
  colour: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export async function fetchReferenceCategories(
  token: string,
  activeOnly = false,
): Promise<ReferenceCategory[]> {
  const res = await fetch(
    `${API_BASE}/api/reference-data/categories?activeOnly=${activeOnly}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw await readError(res, 'Unable to load reference categories.');
  return res.json() as Promise<ReferenceCategory[]>;
}

export async function fetchReferenceValues(
  token: string,
  category: string,
  activeOnly = true,
): Promise<ReferenceValue[]> {
  const res = await fetch(
    `${API_BASE}/api/reference-data/${encodeURIComponent(category)}?activeOnly=${activeOnly}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw await readError(res, 'Unable to load reference values.');
  return res.json() as Promise<ReferenceValue[]>;
}

export async function createReferenceCategory(
  token: string,
  body: { key: string; name: string; description?: string },
): Promise<ReferenceCategory> {
  const res = await fetch(`${API_BASE}/api/reference-data/categories`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res, 'Unable to create category.');
  return res.json() as Promise<ReferenceCategory>;
}

export async function updateReferenceCategory(
  token: string,
  idOrKey: string,
  body: { name?: string; description?: string; isActive?: boolean },
): Promise<ReferenceCategory> {
  const res = await fetch(`${API_BASE}/api/reference-data/categories/${encodeURIComponent(idOrKey)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res, 'Unable to update category.');
  return res.json() as Promise<ReferenceCategory>;
}

export async function createReferenceValue(
  token: string,
  category: string,
  body: {
    code: string;
    displayName: string;
    description?: string;
    colour?: string;
    icon?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<ReferenceValue> {
  const res = await fetch(`${API_BASE}/api/reference-data/${encodeURIComponent(category)}/values`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res, 'Unable to create value.');
  return res.json() as Promise<ReferenceValue>;
}

export async function updateReferenceValue(
  token: string,
  id: string,
  body: {
    displayName?: string;
    description?: string;
    colour?: string;
    icon?: string;
    isActive?: boolean;
    metadata?: Record<string, unknown>;
  },
): Promise<ReferenceValue> {
  const res = await fetch(`${API_BASE}/api/reference-data/values/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res, 'Unable to update value.');
  return res.json() as Promise<ReferenceValue>;
}

/** Soft delete (deactivate) a reference value. */
export async function deactivateReferenceValue(token: string, id: string): Promise<ReferenceValue> {
  const res = await fetch(`${API_BASE}/api/reference-data/values/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to deactivate value.');
  return res.json() as Promise<ReferenceValue>;
}

export async function reorderReferenceValues(
  token: string,
  category: string,
  orderedIds: string[],
): Promise<ReferenceValue[]> {
  const res = await fetch(`${API_BASE}/api/reference-data/${encodeURIComponent(category)}/reorder`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) throw await readError(res, 'Unable to reorder values.');
  return res.json() as Promise<ReferenceValue[]>;
}

// ── Teleconsultation / Clinical Activity Lifecycle ───────────────────────────

/**
 * A metadata-driven condition, evaluated against the current form values to
 * drive conditional visibility (`visibleWhen`) or conditional mandatory
 * (`requiredWhen`). Fully data-driven — the renderer contains no disease logic.
 */
export interface FieldCondition {
  /** Key (or label) of the controlling field whose value is tested. */
  field: string;
  /** Match when the controlling value equals this string. */
  equals?: string;
  /** Match when the controlling value is one of these strings. */
  in?: string[];
  /** Match on truthiness (true → require a value; false → require empty). */
  truthy?: boolean;
}

/**
 * A dynamic, programme-specific outcome field (from the event's outcome
 * template). Everything the Outcome Renderer needs comes from here — no field
 * is defined in React. The core five attributes are always present; the richer
 * attributes (M37J) are optional and backward-compatible with older templates.
 */
export interface ClinicalFieldDef {
  type:
    | 'text' | 'longtext' | 'number' | 'date' | 'datetime'
    | 'dropdown' | 'select' | 'multiselect'
    | 'radio' | 'checkbox' | 'boolean' | string;
  label: string;
  options: string[];
  required: boolean;
  sortOrder: number;
  /** Stable machine key for the value map; falls back to `label` when absent. */
  key?: string;
  /** Section title used to group fields; defaults to a single section. */
  section?: string;
  /** Order of this field's section relative to others. */
  sectionOrder?: number;
  /** Placeholder text for text/number/select inputs. */
  placeholder?: string;
  /** Helper text rendered under the control. */
  helpText?: string;
  /** Default value applied when the form initialises. */
  defaultValue?: string | string[] | number | boolean | null;
  /** Render this field only when the condition holds. */
  visibleWhen?: FieldCondition;
  /** Make this field mandatory only when the condition holds. */
  requiredWhen?: FieldCondition;
}

export interface ConsultationPatientInfo {
  citizenId: string | null;
  uhid: string | null;
  fullName: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
  assignedWorker: string | null;
}

export interface ConsultationClinicalContext {
  program: string | null;
  activity: string | null;
  enrollmentStatus: string | null;
  enrollmentId: string;
  condition: string | null;
}

export interface DialInfo {
  phone: string | null;
  telLink: string | null;
  provider: 'tel';
}

/** A selectable consultation outcome, sourced from the event's outcome_types. */
export interface OutcomeOption {
  id: string;
  code: string;
  name: string;
  category: string;
}

export interface ConsultationNote {
  id: string;
  generatedNote: string;
  noteVersion: number;
  status: 'DRAFT' | 'FINAL';
  recordedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One selectable counselling item within a wizard section (16B+). */
export interface CounsellingItem {
  id: string;
  /** Text displayed to the field worker on the selection row. */
  body: string;
  /** Text appended to the note when selected. Equals body when not separately configured. */
  noteText: string;
  sortOrder: number;
}

/**
 * A logical counselling section (Lifestyle, Nutrition, Medicines, …).
 * Names and content come entirely from the database — never hardcoded.
 */
export interface CounsellingSection {
  id: string;
  name: string;
  sortOrder: number;
  items: CounsellingItem[];
}

export interface ConsultationContext {
  activity: Activity;
  patient: ConsultationPatientInfo;
  clinicalContext: ConsultationClinicalContext;
  dial: DialInfo;
  /** Full guidebook detail (16A+): includes structured sections. GuidebookRef fields (id, code, category, title) are always present. */
  guidebook: GuidebookDetail | null;
  clinicalForm: {
    templateId: string | null;
    templateName: string | null;
    fields: ClinicalFieldDef[];
  };
  /** Configurable outcomes for this event (drive the Workflow Rules Engine). */
  outcomeOptions: OutcomeOption[];
  /** Most recent DRAFT note for this activity, if any (workspace resume). */
  previousNote: ConsultationNote | null;
  /**
   * Database-driven counselling sections for the wizard (16B+).
   * Empty array when no counselling content is configured for the matched guidebook.
   */
  counsellingSections: CounsellingSection[];
}

export interface StartCallResult {
  activity: Activity;
  dial: DialInfo;
  attemptNumber: number;
}

export interface SaveConsultationPayload {
  outcomeTypeId: string;
  clinicalNotes?: string;
  remarks?: string;
  clinicalData?: Record<string, unknown>;
  /** Auto-generated (and optionally edited) note — persisted as FINAL alongside the outcome. */
  generatedNote?: string;
  noteStatus?: 'DRAFT' | 'FINAL';
  /** Counselling item IDs the worker checked during the session (for CDSE classification). */
  checkedItemIds?: string[];
  /** All counselling item IDs available during the session (full protocol set for CDSE). */
  counsellingItemIds?: string[];
}

export interface SaveConsultationResult {
  activity: Activity;
  nextActivity: Activity | null;
  enrollmentStatus: string | null;
  outcomeRecordId: string;
  /** The workflow action the engine executed, for UI feedback. */
  workflowAction: string;
  workflowMessage: string;
  escalated: boolean;
}

export interface TimelineEntry {
  /** COMPLETION marks a finished care plan (enrollment reached COMPLETED). */
  kind: 'ENROLLMENT' | 'ACTIVITY' | 'COMPLETION';
  id: string;
  title: string;
  program: string | null;
  status: string;
  date: string | null;
  outcome: string | null;
  priority: string | null;
}

export async function fetchConsultationContext(
  token: string,
  activityId: string,
): Promise<ConsultationContext> {
  const res = await fetch(`${API_BASE}/api/activities/${activityId}/consultation`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load care record.');
  return res.json() as Promise<ConsultationContext>;
}

export async function startCall(
  token: string,
  activityId: string,
): Promise<StartCallResult> {
  const res = await fetch(`${API_BASE}/api/activities/${activityId}/start-call`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw await readError(res, 'Unable to start the call.');
  return res.json() as Promise<StartCallResult>;
}

export async function saveConsultation(
  token: string,
  activityId: string,
  payload: SaveConsultationPayload,
): Promise<SaveConsultationResult> {
  const res = await fetch(`${API_BASE}/api/activities/${activityId}/consultation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to save the care record.');
  return res.json() as Promise<SaveConsultationResult>;
}

export async function fetchCitizenTimeline(
  token: string,
  citizenId: string,
): Promise<TimelineEntry[]> {
  const res = await fetch(`${API_BASE}/api/citizens/${citizenId}/timeline`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load patient timeline.');
  return res.json() as Promise<TimelineEntry[]>;
}

/** Upserts a DRAFT consultation note (auto-save from the workspace). */
export async function upsertConsultationNote(
  token: string,
  activityId: string,
  generatedNote: string,
): Promise<ConsultationNote> {
  const res = await fetch(`${API_BASE}/api/activities/${activityId}/consultation-note`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ generatedNote }),
  });
  if (!res.ok) throw await readError(res, 'Unable to save note draft.');
  return res.json() as Promise<ConsultationNote>;
}

/** Fetches the current DRAFT note for an activity, or null. */
export async function fetchConsultationNote(
  token: string,
  activityId: string,
): Promise<ConsultationNote | null> {
  const res = await fetch(`${API_BASE}/api/activities/${activityId}/consultation-note`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load care record.');
  return res.json() as Promise<ConsultationNote | null>;
}

/** Enriched per-activity consultation history entry for the workspace history panel. */
export interface ConsultationHistoryEntry {
  activityId: string;
  eventName: string;
  program: string | null;
  date: string | null;
  activityStatus: string;
  outcomeName: string | null;
  outcomeCategory: string | null;
  clinicalNotes: string | null;
  remarks: string | null;
  recordedBy: string | null;
  /** Structured clinical field values (from outcome_records.data.fields). */
  clinicalData: Record<string, unknown> | null;
  /** The FINAL generated consultation note, if one was saved. */
  generatedNote: string | null;
}

export async function fetchConsultationHistory(
  token: string,
  citizenId: string,
): Promise<ConsultationHistoryEntry[]> {
  const res = await fetch(`${API_BASE}/api/citizens/${citizenId}/consultation-history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load care history.');
  return res.json() as Promise<ConsultationHistoryEntry[]>;
}

/**
 * One entry in the Clinical Journey — a unified view of every clinical event
 * for a citizen, aggregated server-side from existing tables. Read-only.
 */
export interface ClinicalJourneyEntry {
  id: string;
  eventType: 'ENROLLMENT' | 'CONSULTATION' | 'ACTIVITY';
  date: string | null;
  program: string | null;
  disease: string | null;
  summary: string;
  activityStatus: string | null;
  outcomeName: string | null;
  outcomeCategory: string | null;
  clinicalNotes: string | null;
  remarks: string | null;
  generatedNote: string | null;
  clinicalData: Record<string, unknown> | null;
  recordedBy: string | null;
  callCount: number;
  enrollmentStatus: string | null;
  eventName: string | null;
}

export async function fetchClinicalJourney(
  token: string,
  citizenId: string,
): Promise<ClinicalJourneyEntry[]> {
  const res = await fetch(`${API_BASE}/api/citizens/${citizenId}/clinical-journey`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load clinical journey.');
  return res.json() as Promise<ClinicalJourneyEntry[]>;
}

/** The first pending/active worklist activity for a citizen, or null. */
export interface ActiveActivity {
  activityId: string;
  eventName: string | null;
  programName: string | null;
}

export async function fetchActiveActivity(
  token: string,
  citizenId: string,
): Promise<ActiveActivity | null> {
  const res = await fetch(`${API_BASE}/api/citizens/${citizenId}/active-activity`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to check for active care.');
  return res.json() as Promise<ActiveActivity | null>;
}

// ── Workflow Rules Engine (Administration) ───────────────────────────────────

/**
 * Read-only view of the retry_config the engine applies for a rule's
 * program + disease. RETRY_ACTIVITY timing comes from here, not delayDays.
 * Null when no retry policy is configured for that program/disease.
 */
export interface ResolvedRetryConfig {
  // Core: the effective retry policy the engine applies.
  retryIntervalHours: number;
  maxAttempts: number;
  escalationAfterAttempts: number;
  escalationRole: string | null;
  // Optional presentation context only.
  program?: string | null;
  disease?: string | null;
}

export interface WorkflowRule {
  id: string;
  outcome: string;
  outcomeCode: string;
  category: string;
  forEvent: string | null;
  action: string;
  nextActivity: string | null;
  generatedEventId: string | null;
  delayDays: number;
  priority: string;
  retryPolicy: string | null;
  escalationRole: string | null;
  notificationRole: string | null;
  /** Role stamped onto activities this rule generates (M31 assignment). */
  assignedRole: string | null;
  conditions: Record<string, unknown> | null;
  isActive: boolean;
  /** Effective retry_config for this rule (read-only; admin display). */
  retryConfig: ResolvedRetryConfig | null;
}

export interface WorkflowEventOption {
  id: string;
  name: string;
  code: string;
}

export interface RetryConfig {
  id: string;
  program: string | null;
  disease: string | null;
  maxAttempts: number;
  retryIntervalHours: number;
  escalationAfterAttempts: number;
  escalationRole: string | null;
  isActive: boolean;
}

export interface WorkflowRulesOverview {
  rules: WorkflowRule[];
  options: {
    actions: string[];
    priorities: string[];
    roles: string[];
    events: WorkflowEventOption[];
    retryPolicies: string[];
  };
  retryConfigs: RetryConfig[];
}

export interface UpdateRulePayload {
  action: string;
  isActive: boolean;
  // Action-specific: sent only when the action actually uses the field.
  // Omitted fields are preserved server-side (never reset).
  generatedEventId?: string;
  delayDays?: number;
  priority?: string;
  retryPolicy?: string | null;
  escalationRole?: string | null;
  notificationRole?: string | null;
  assignedRole?: string | null;
}

export async function fetchWorkflowRules(token: string): Promise<WorkflowRulesOverview> {
  const res = await fetch(`${API_BASE}/api/workflow/rules`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load workflow rules.');
  return res.json() as Promise<WorkflowRulesOverview>;
}

export async function updateWorkflowRule(
  token: string,
  id: string,
  payload: UpdateRulePayload,
): Promise<WorkflowRule> {
  const res = await fetch(`${API_BASE}/api/workflow/rules/${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to update the workflow rule.');
  return res.json() as Promise<WorkflowRule>;
}

// ── Analytics Foundation ─────────────────────────────────────────────────────

export interface AnalyticsQueryParams {
  from?: string;
  to?: string;
  programId?: string;
  diseaseId?: string;
  district?: string;
  worker?: string;
}

export interface ExecutiveSummary {
  totalPatients: number | null;
  todaysRegistrations: number | null;
  activeEnrollments: number | null;
  pendingActivities: number | null;
  completedActivities: number | null;
  overdueActivities: number | null;
  escalatedCases: number | null;
  duplicateRequests: number | null;
  schedulerRunsToday: number | null;
  workflowSuccessRate: number | null;
  completionRate: number | null;
  averageResponseHours: number | null;
}

export interface ProgramAnalyticsRow {
  programId: string;
  program: string;
  registeredPatients: number;
  activeEnrollments: number;
  completedActivities: number;
  pendingActivities: number;
  overdueActivities: number;
  completionRate: number;
}

export interface WorklistAnalytics {
  pending: number;
  completed: number;
  overdue: number;
  escalated: number;
  totalRetries: number;
  averageCompletionHours: number | null;
  createdToday: number;
  completedToday: number;
  createdThisWeek: number;
}

export interface WorkerPerformanceRow {
  username: string;
  fullName: string;
  role: string;
  assigned: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
  averageResponseHours: number | null;
  escalations: number;
  retries: number;
}

export interface NameCount {
  name: string;
  count: number;
}

export interface RegistrationAnalytics {
  today: number;
  thisWeek: number;
  thisMonth: number;
  byProgram: NameCount[];
  byWorker: NameCount[];
  duplicatesPrevented: number | null;
  bulkUploads: number | null;
}

export interface KnowledgeItemStat {
  id: string;
  title: string;
  category: string | null;
  views: number | null;
}
export interface KnowledgeAnalytics {
  totals: { guidebooks: number; faqs: number; training: number; emergency: number };
  topGuidebooks: KnowledgeItemStat[];
  topFaqs: KnowledgeItemStat[];
  topTraining: KnowledgeItemStat[];
  topEmergency: KnowledgeItemStat[];
  tracking: boolean;
}

export interface SchedulerAnalytics {
  totalRuns: number;
  activitiesGenerated: number;
  retries: number;
  escalations: number;
  failures: number;
  averageRuntimeMs: number | null;
  successRate: number | null;
  runsToday: number;
}

export interface WorkflowAnalytics {
  mostTriggeredOutcomes: NameCount[];
  mostCommonOutcomes: NameCount[];
  retrySuccessRate: number | null;
  escalationRate: number | null;
  averageDelayDays: number | null;
  rulesExecutedToday: number;
}

/** One day of the 30-day clinical-risk trend (alerts triggered, by level). */
export interface RiskTrendPoint {
  date: string;
  moderate: number;
  severe: number;
}

/** Clinical Risk analytics (M34) — mirrors backend RiskAnalyticsDto. */
export interface RiskAnalytics {
  low: number;
  moderate: number;
  severe: number;
  activeAlerts: number;
  resolvedAlerts: number;
  trend: RiskTrendPoint[];
  distribution: NameCount[];
}

/** Per-disease patient analytics (M34) — mirrors backend DiseaseAnalyticsRow. */
export interface DiseaseAnalyticsRow {
  diseaseId: string;
  disease: string;
  totalPatients: number;
  activePatients: number;
  completedPatients: number;
  highRiskPatients: number;
}

export interface AnalyticsFilterOptions {
  programs: { id: string; name: string }[];
  workers: { username: string; fullName: string; role: string }[];
  districts: string[];
  diseases: { id: string; name: string }[];
}

function analyticsQuery(p: AnalyticsQueryParams): string {
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v && String(v).trim()) qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

async function getAnalytics<T>(token: string, path: string, p: AnalyticsQueryParams = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api/analytics/${path}${analyticsQuery(p)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load analytics.');
  return res.json() as Promise<T>;
}

export const fetchExecutiveSummary = (t: string, p?: AnalyticsQueryParams) =>
  getAnalytics<ExecutiveSummary>(t, 'executive', p);
export const fetchProgramAnalytics = (t: string, p?: AnalyticsQueryParams) =>
  getAnalytics<ProgramAnalyticsRow[]>(t, 'programs', p);
export const fetchWorklistAnalytics = (t: string, p?: AnalyticsQueryParams) =>
  getAnalytics<WorklistAnalytics>(t, 'worklist', p);
export const fetchWorkerPerformance = (t: string, p?: AnalyticsQueryParams) =>
  getAnalytics<WorkerPerformanceRow[]>(t, 'workers', p);
export const fetchRegistrationAnalytics = (t: string, p?: AnalyticsQueryParams) =>
  getAnalytics<RegistrationAnalytics>(t, 'registrations', p);
export const fetchSchedulerAnalytics = (t: string) =>
  getAnalytics<SchedulerAnalytics>(t, 'scheduler');
export const fetchWorkflowAnalytics = (t: string, p?: AnalyticsQueryParams) =>
  getAnalytics<WorkflowAnalytics>(t, 'workflow', p);
export const fetchKnowledgeAnalytics = (t: string) =>
  getAnalytics<KnowledgeAnalytics>(t, 'knowledge');
export const fetchRiskAnalytics = (t: string, p?: AnalyticsQueryParams) =>
  getAnalytics<RiskAnalytics>(t, 'risk', p);
export const fetchDiseaseAnalytics = (t: string, p?: AnalyticsQueryParams) =>
  getAnalytics<DiseaseAnalyticsRow[]>(t, 'diseases', p);
export const fetchAnalyticsFilterOptions = (t: string) =>
  getAnalytics<AnalyticsFilterOptions>(t, 'filter-options');

/**
 * Milestone 19 — Operations Dashboard.
 * Aggregated snapshot for supervisors and medical officers: what needs attention
 * today. Single round-trip; embeds programs and workers so the frontend does not
 * need to call those endpoints separately.
 */
export interface OperationsDashboard {
  dueToday: number;
  overdueActivities: number;
  highPriorityActivities: number;
  escalatedActivities: number;
  totalCitizens: number;
  activeEnrollments: number;
  newRegistrationsToday: number;
  consultationsCompletedToday: number;
  consultationsPending: number;
  referralsToday: number;
  programs: ProgramAnalyticsRow[];
  workers: WorkerPerformanceRow[];
}

export const fetchOperationsDashboard = (t: string, p?: AnalyticsQueryParams) =>
  getAnalytics<OperationsDashboard>(t, 'operations', p);

// ── Clinical Decision Support Engine (CDSE) — Milestone 25 ───────────────────

/** Four-level risk classification produced by the CDSE after each consultation. */
export type CdseRiskLevel = 'NONE' | 'LOW' | 'MODERATE' | 'SEVERE';

export interface ClinicalAlert {
  id: string;
  citizenId: string;
  activityId: string | null;
  disease: string | null;
  riskLevel: 'MODERATE' | 'SEVERE';
  status: 'ACTIVE' | 'RESOLVED';
  triggeredAt: string;
  resolvedAt: string | null;
}

export interface AlertWithCitizen extends ClinicalAlert {
  citizenName: string | null;
  uhid: string | null;
  /** True once any user has opened the alert; read alerts stay visible but muted. */
  isRead: boolean;
}

export interface CitizenRiskSummary {
  citizenId: string;
  riskLevel: CdseRiskLevel;
  disease: string | null;
  evaluatedAt: string | null;
  activeAlert: ClinicalAlert | null;
}

export async function fetchCitizenRisk(
  token: string,
  citizenId: string,
): Promise<CitizenRiskSummary> {
  const res = await fetch(
    `${API_BASE}/api/citizens/${encodeURIComponent(citizenId)}/risk`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error('Failed to load citizen risk');
  return res.json() as Promise<CitizenRiskSummary>;
}

export async function fetchCitizenAlerts(
  token: string,
  citizenId: string,
): Promise<ClinicalAlert[]> {
  const res = await fetch(
    `${API_BASE}/api/citizens/${encodeURIComponent(citizenId)}/alerts`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error('Failed to load citizen alerts');
  return res.json() as Promise<ClinicalAlert[]>;
}

export async function fetchActiveAlerts(
  token: string,
  status: 'ACTIVE' | 'RESOLVED' = 'ACTIVE',
): Promise<AlertWithCitizen[]> {
  const res = await fetch(`${API_BASE}/api/alerts/active?status=${status}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to load active alerts');
  return res.json() as Promise<AlertWithCitizen[]>;
}

/** Marks one alert as read (idempotent). Fired when a notification is opened. */
export async function markAlertRead(token: string, alertId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/alerts/${encodeURIComponent(alertId)}/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to mark the alert as read');
}

// ── Overall Risk Engine (matrix-driven; decision lives in PostgreSQL) ──────────

export type ClinicalSeverity = 'LOW' | 'MODERATE' | 'SEVERE';
export type FollowupRiskLevel = 'LOW' | 'MODERATE' | 'HIGH';
export type OverallRiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

export interface OverallRiskResolution {
  clinicalSeverity: ClinicalSeverity;
  followupRisk: FollowupRiskLevel;
  overallRisk: OverallRiskLevel;
  explanation: string;
  matched: boolean;
  source: 'matrix';
}

export interface OverallRiskMatrixEntry {
  id: string;
  clinicalSeverity: ClinicalSeverity;
  followupRisk: FollowupRiskLevel;
  overallRisk: OverallRiskLevel;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Resolves a citizen's Overall Risk by looking up the (Clinical Severity ×
 * AI Follow-up Risk) pair in the server-side decision matrix. `clinicalSeverity`
 * accepts the CDSE category (NONE|LOW|MODERATE|SEVERE); `followupRisk` accepts
 * the classified band or the engine's display band (Low|Medium|High) — the
 * backend normalises both before the lookup.
 */
export async function resolveOverallRisk(
  token: string,
  clinicalSeverity: string,
  followupRisk: string,
): Promise<OverallRiskResolution> {
  const res = await fetch(
    `${API_BASE}/api/overall-risk/resolve?clinicalSeverity=${encodeURIComponent(clinicalSeverity)}&followupRisk=${encodeURIComponent(followupRisk)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw await readError(res, 'Failed to resolve overall risk.');
  return res.json() as Promise<OverallRiskResolution>;
}

/** The full Overall Risk decision matrix (for inspection / config surfaces). */
export async function fetchOverallRiskMatrix(token: string): Promise<OverallRiskMatrixEntry[]> {
  const res = await fetch(`${API_BASE}/api/overall-risk/matrix`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Failed to load overall risk matrix.');
  return res.json() as Promise<OverallRiskMatrixEntry[]>;
}

/** One item for the batch resolver: an id plus the two engine inputs. */
export interface OverallRiskBatchInput {
  id: string;
  clinicalSeverity: string;
  followupRisk: string;
}

/** A batch result — the single-resolve shape plus the caller's `id`. */
export interface OverallRiskBatchResult extends OverallRiskResolution {
  id: string;
}

/**
 * Resolves Overall Risk for many citizens in a SINGLE request (Dashboard,
 * Worklist). One DB round-trip server-side regardless of list size. Each result
 * is identical to {@link resolveOverallRisk} plus its `id`; ids absent from the
 * response could not be resolved and should render as "Pending Assessment".
 */
export async function resolveOverallRiskBatch(
  token: string,
  items: OverallRiskBatchInput[],
): Promise<OverallRiskBatchResult[]> {
  if (items.length === 0) return [];
  const res = await fetch(`${API_BASE}/api/overall-risk/resolve-batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw await readError(res, 'Failed to resolve overall risk (batch).');
  return res.json() as Promise<OverallRiskBatchResult[]>;
}

// ── Backward-compat types — used by Care Plan panel ───────────────────────────

export type RecommendationPriority =
  | 'CRITICAL'
  | 'HIGH'
  | 'RECOMMENDED'
  | 'PREVENTIVE'
  | 'INFORMATION';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

export interface CdsRecommendation {
  ruleId: string;
  title: string;
  explanation: string;
  reasons: string[];
  action: string;
  priority: RecommendationPriority;
  supportingRule: string;
}

export interface CdsResponse {
  citizenId: string;
  overallRisk: RiskLevel;
  riskExplanation: string;
  recommendations: CdsRecommendation[];
  evaluatedAt: string;
  totalActivePrograms: number;
  totalConsultations: number;
}

export async function fetchCdsRecommendations(
  token: string,
  citizenId: string,
): Promise<CdsResponse> {
  const res = await fetch(
    `${API_BASE}/api/citizens/${encodeURIComponent(citizenId)}/cdse-recommendations`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error('Failed to load clinical recommendations');
  return res.json() as Promise<CdsResponse>;
}

// ── Longitudinal Care Plan Engine ─────────────────────────────────────────────

export type CarePlanStatus     = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'SUSPENDED';
export type ProblemStatus      = 'ACTIVE' | 'RESOLVED' | 'MONITORING' | 'DEFERRED';
export type GoalCategory       = 'CLINICAL' | 'LIFESTYLE' | 'MEDICATION' | 'EDUCATION' | 'REFERRAL';
export type GoalStatus         = 'ACTIVE' | 'ACHIEVED' | 'PARTIAL' | 'NOT_ACHIEVED' | 'DEFERRED';
export type GoalPriority       = 'CRITICAL' | 'HIGH' | 'ROUTINE';
export type InterventionStatus = 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'DISCONTINUED';
export type ProgressType       = 'ASSESSMENT' | 'UPDATE' | 'REVIEW' | 'ESCALATION' | 'ACHIEVEMENT';
export type CdseDecision       = 'ACCEPTED' | 'DECLINED';

export interface CarePlanIntervention {
  id: string;
  goalId: string;
  carePlanId: string;
  title: string;
  description: string | null;
  frequency: string | null;
  responsible: string | null;
  status: InterventionStatus;
  assignedBy: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  completedBy: string | null;
  completedDate: string | null;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CarePlanGoal {
  id: string;
  problemId: string;
  carePlanId: string;
  title: string;
  description: string | null;
  targetValue: string | null;
  targetDate: string | null;
  category: GoalCategory;
  status: GoalStatus;
  priority: GoalPriority;
  cdseRuleId: string | null;
  sortOrder: number;
  interventions: CarePlanIntervention[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CarePlanProblem {
  id: string;
  carePlanId: string;
  enrollmentId: string | null;
  programId: string | null;
  programName: string | null;
  title: string;
  description: string | null;
  identifiedDate: string | null;
  status: ProblemStatus;
  sortOrder: number;
  goals: CarePlanGoal[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CarePlan {
  id: string;
  citizenId: string;
  citizenName: string | null;
  status: CarePlanStatus;
  title: string;
  summary: string | null;
  createdBy: string;
  lastReviewedBy: string | null;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  problems: CarePlanProblem[];
}

export interface CarePlanSummary {
  id: string;
  citizenId: string;
  status: CarePlanStatus;
  title: string;
  summary: string | null;
  totalProblems: number;
  activeProblems: number;
  activeGoals: number;
  achievedGoals: number;
  lastReviewedAt: string | null;
  updatedAt: string;
}

export interface CarePlanProgress {
  id: string;
  carePlanId: string;
  goalId: string | null;
  goalTitle: string | null;
  problemTitle: string | null;
  worklistItemId: string | null;
  outcomeRecordId: string | null;
  progressNote: string;
  progressType: ProgressType;
  recordedBy: string;
  recordedAt: string;
}

export interface CdseGoalSuggestion {
  cdseRuleId: string;
  title: string;
  description: string;
  targetValue: string | null;
  category: GoalCategory;
  priority: GoalPriority;
  cdsePriority: string;
  alreadyAccepted: boolean;
  lastDecision: CdseDecision | null;
  lastDeclineReason: string | null;
}

export interface CdseDecisionEntry {
  cdseRuleId: string;
  recommendationTitle: string;
  decision: CdseDecision;
  declineReason?: string;
  problemId?: string;
}

export interface CdseDecisionResult {
  recorded: number;
  goalsCreated: CarePlanGoal[];
}

// ── Care Plan API functions ───────────────────────────────────────────────────

async function cpReq<T>(token: string, path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opts?.headers },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Care plan request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const fetchCarePlan = (token: string, citizenId: string) =>
  cpReq<CarePlan | null>(token, `citizens/${encodeURIComponent(citizenId)}/care-plan`);

export const fetchCarePlanSummary = (token: string, citizenId: string) =>
  cpReq<CarePlanSummary | null>(token, `citizens/${encodeURIComponent(citizenId)}/care-plan/summary`);

export const createCarePlan = (token: string, citizenId: string, body: { title: string; summary?: string }) =>
  cpReq<CarePlan>(token, `citizens/${encodeURIComponent(citizenId)}/care-plan`, {
    method: 'POST', body: JSON.stringify(body),
  });

export const updateCarePlan = (token: string, carePlanId: string, body: { title?: string; summary?: string; status?: CarePlanStatus }) =>
  cpReq<CarePlan>(token, `care-plans/${carePlanId}`, { method: 'PUT', body: JSON.stringify(body) });

export const addProblem = (token: string, carePlanId: string, body: { title: string; description?: string; enrollmentId?: string; identifiedDate?: string; status?: ProblemStatus }) =>
  cpReq<CarePlan>(token, `care-plans/${carePlanId}/problems`, { method: 'POST', body: JSON.stringify(body) });

export const updateProblem = (token: string, carePlanId: string, problemId: string, body: { title: string; description?: string; enrollmentId?: string; identifiedDate?: string; status?: ProblemStatus }) =>
  cpReq<CarePlan>(token, `care-plans/${carePlanId}/problems/${problemId}`, { method: 'PUT', body: JSON.stringify(body) });

export const deleteProblem = (token: string, carePlanId: string, problemId: string) =>
  cpReq<CarePlan>(token, `care-plans/${carePlanId}/problems/${problemId}`, { method: 'DELETE' });

export const addGoal = (token: string, carePlanId: string, problemId: string, body: { title: string; category: GoalCategory; priority: GoalPriority; description?: string; targetValue?: string; targetDate?: string; status?: GoalStatus }) =>
  cpReq<CarePlanGoal>(token, `care-plans/${carePlanId}/problems/${problemId}/goals`, { method: 'POST', body: JSON.stringify(body) });

export const updateGoal = (token: string, carePlanId: string, goalId: string, body: { title: string; category: GoalCategory; priority: GoalPriority; description?: string; targetValue?: string; targetDate?: string; status?: GoalStatus }) =>
  cpReq<CarePlan>(token, `care-plans/${carePlanId}/goals/${goalId}`, { method: 'PUT', body: JSON.stringify(body) });

export const updateGoalStatus = (token: string, carePlanId: string, goalId: string, status: GoalStatus) =>
  cpReq<CarePlan>(token, `care-plans/${carePlanId}/goals/${goalId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });

export const deleteGoal = (token: string, carePlanId: string, goalId: string) =>
  cpReq<CarePlan>(token, `care-plans/${carePlanId}/goals/${goalId}`, { method: 'DELETE' });

export const addIntervention = (token: string, carePlanId: string, goalId: string, body: { title: string; description?: string; frequency?: string; responsible?: string; status?: InterventionStatus; assignedBy?: string; assignedTo?: string; dueDate?: string; completedBy?: string; completedDate?: string }) =>
  cpReq<CarePlan>(token, `care-plans/${carePlanId}/goals/${goalId}/interventions`, { method: 'POST', body: JSON.stringify(body) });

export const updateIntervention = (token: string, carePlanId: string, interventionId: string, body: { title: string; description?: string; frequency?: string; responsible?: string; status?: InterventionStatus; assignedBy?: string; assignedTo?: string; dueDate?: string; completedBy?: string; completedDate?: string }) =>
  cpReq<CarePlan>(token, `care-plans/${carePlanId}/interventions/${interventionId}`, { method: 'PUT', body: JSON.stringify(body) });

export const deleteIntervention = (token: string, carePlanId: string, interventionId: string) =>
  cpReq<CarePlan>(token, `care-plans/${carePlanId}/interventions/${interventionId}`, { method: 'DELETE' });

export const recordProgress = (token: string, carePlanId: string, body: { goalId?: string; worklistItemId?: string; outcomeRecordId?: string; progressNote: string; progressType: ProgressType }) =>
  cpReq<CarePlanProgress>(token, `care-plans/${carePlanId}/progress`, { method: 'POST', body: JSON.stringify(body) });

export const fetchProgress = (token: string, carePlanId: string) =>
  cpReq<CarePlanProgress[]>(token, `care-plans/${carePlanId}/progress`);

export const fetchCdseSuggestions = (token: string, carePlanId: string) =>
  cpReq<CdseGoalSuggestion[]>(token, `care-plans/${carePlanId}/cdse-suggestions`);

export const recordCdseDecisions = (token: string, carePlanId: string, decisions: CdseDecisionEntry[]) =>
  cpReq<CdseDecisionResult>(token, `care-plans/${carePlanId}/cdse-decisions`, {
    method: 'POST', body: JSON.stringify({ decisions }),
  });

// ── Users & Roles administration ─────────────────────────────────────────────

export interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  facility: string | null;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export async function fetchUsers(token: string): Promise<AdminUser[]> {
  const res = await fetch(`${API_BASE}/api/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load users.');
  return res.json() as Promise<AdminUser[]>;
}

export async function fetchAssignableRoles(token: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/users/roles`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load roles.');
  const body = (await res.json()) as { roles: string[] };
  return body.roles;
}

export interface CreateUserPayload {
  username: string;
  fullName: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  facility?: string;
  role: string;
  password: string;
}

/** Partial update — mirrors the backend UpdateUserDto exactly. */
export interface UpdateUserPayload {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  designation?: string | null;
  facility?: string | null;
  role?: string;
  isActive?: boolean;
}

export async function createUser(token: string, payload: CreateUserPayload): Promise<AdminUser> {
  const res = await fetch(`${API_BASE}/api/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to create the user.');
  return res.json() as Promise<AdminUser>;
}

export async function updateUser(
  token: string,
  id: string,
  payload: UpdateUserPayload,
): Promise<AdminUser> {
  const res = await fetch(`${API_BASE}/api/users/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to update the user.');
  return res.json() as Promise<AdminUser>;
}

/** Administrative password reset — mirrors the backend ResetPasswordDto. 204 on success. */
export async function resetUserPassword(
  token: string,
  id: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/${id}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) throw await readError(res, 'Unable to reset the password.');
}

// ── RBAC engine (Milestone 1 read APIs + Milestone 2 user role assignment) ────

export interface RbacPermission {
  id: string;
  key: string;
  group: string;
  label: string;
  description: string | null;
  sortOrder: number;
  /** Keys of prerequisite permissions this one depends on (dependency config). */
  requires: string[];
}

export interface RbacPermissionGroup {
  group: string;
  permissions: RbacPermission[];
}

export interface RbacRoleSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissionCount: number;
  userCount: number;
  createdAt: string;
}

export interface RbacRoleDetail {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissionKeys: string[];
  createdAt: string;
}

export interface RbacUserRole {
  id: string;
  key: string;
  name: string;
  color: string | null;
  isPrimary: boolean;
}

/** A per-user permission override: grant force-allows, !grant force-denies. */
export interface RbacUserOverride {
  permissionKey: string;
  grant: boolean;
}

export interface RbacUserAccess {
  userId: string;
  username: string;
  fullName: string;
  roles: RbacUserRole[];
  /** Permissions inherited from the assigned role (read-only base set). */
  rolePermissions: string[];
  /** Per-user grant/deny overrides layered on the role. */
  overrides: RbacUserOverride[];
  /** Resolved set: (role ∪ grants) \ denies. */
  effectivePermissions: string[];
}

/** The full permission catalogue, grouped (Navigation, Workflow, …). */
export async function fetchRbacPermissions(token: string): Promise<RbacPermissionGroup[]> {
  const res = await fetch(`${API_BASE}/api/rbac/permissions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load permissions.');
  return res.json() as Promise<RbacPermissionGroup[]>;
}

export async function fetchRbacRoles(token: string): Promise<RbacRoleSummary[]> {
  const res = await fetch(`${API_BASE}/api/rbac/roles`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load roles.');
  return res.json() as Promise<RbacRoleSummary[]>;
}

export async function fetchRbacRole(token: string, idOrKey: string): Promise<RbacRoleDetail> {
  const res = await fetch(`${API_BASE}/api/rbac/roles/${encodeURIComponent(idOrKey)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load the role.');
  return res.json() as Promise<RbacRoleDetail>;
}

export async function fetchUserAccess(token: string, userId: string): Promise<RbacUserAccess> {
  const res = await fetch(`${API_BASE}/api/rbac/users/${userId}/access`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await readError(res, 'Unable to load user access.');
  return res.json() as Promise<RbacUserAccess>;
}

/** Assign roles to a user (first key = primary). Returns the refreshed access. */
export async function setUserRoles(
  token: string,
  userId: string,
  roleKeys: string[],
): Promise<RbacUserAccess> {
  const res = await fetch(`${API_BASE}/api/rbac/users/${userId}/roles`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleKeys }),
  });
  if (!res.ok) throw await readError(res, 'Unable to update user roles.');
  return res.json() as Promise<RbacUserAccess>;
}

/**
 * Replace a user's per-user permission overrides (enterprise RBAC). Pass the full
 * desired set; an empty array resets the user to role defaults. Returns refreshed
 * access with recomputed effective permissions. Writes only to
 * `rbac_user_permission_overrides` — role definitions are never modified.
 */
export async function setUserOverrides(
  token: string,
  userId: string,
  overrides: RbacUserOverride[],
): Promise<RbacUserAccess> {
  const res = await fetch(`${API_BASE}/api/rbac/users/${userId}/overrides`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides }),
  });
  if (!res.ok) throw await readError(res, 'Unable to update user overrides.');
  return res.json() as Promise<RbacUserAccess>;
}

// ── Role Designer writes (Milestone 3) ────────────────────────────────────────

export interface CreateRolePayload {
  name: string;
  description?: string;
  color?: string;
  permissionKeys?: string[];
}

export interface UpdateRolePayload {
  name?: string;
  description?: string;
  color?: string;
  isActive?: boolean;
}

export async function createRole(token: string, payload: CreateRolePayload): Promise<RbacRoleDetail> {
  const res = await fetch(`${API_BASE}/api/rbac/roles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to create the role.');
  return res.json() as Promise<RbacRoleDetail>;
}

export async function updateRole(
  token: string,
  idOrKey: string,
  payload: UpdateRolePayload,
): Promise<RbacRoleDetail> {
  const res = await fetch(`${API_BASE}/api/rbac/roles/${encodeURIComponent(idOrKey)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res, 'Unable to update the role.');
  return res.json() as Promise<RbacRoleDetail>;
}

export async function setRolePermissions(
  token: string,
  idOrKey: string,
  permissionKeys: string[],
): Promise<RbacRoleDetail> {
  const res = await fetch(`${API_BASE}/api/rbac/roles/${encodeURIComponent(idOrKey)}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissionKeys }),
  });
  if (!res.ok) throw await readError(res, 'Unable to update role permissions.');
  return res.json() as Promise<RbacRoleDetail>;
}
