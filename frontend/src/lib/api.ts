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
  completedToday: number | null;
  referred: number | null;
  noAnswer: number | null;
  emergencyReferrals: number | null;
}

export interface ServiceItem {
  name: string;
  icon: string | null;
  color: string | null;
}

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

/** Surfaces a backend validation message (string | string[]) as one Error. */
async function citizenError(res: Response, fallback: string): Promise<Error> {
  let message = fallback;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (body?.message) {
      message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    }
  } catch {
    /* keep fallback */
  }
  return new Error(message);
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
  if (!res.ok) throw await citizenError(res, 'Unable to register patient.');
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
  if (!res.ok) throw await citizenError(res, 'Unable to upload patients.');
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
  if (!res.ok) throw await citizenError(res, 'Unable to load registration options.');
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
  if (!res.ok) throw await citizenError(res, 'Unable to check for duplicates.');
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
  if (!res.ok) throw await citizenError(res, 'Unable to register patient.');
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
  if (!res.ok) throw await citizenError(res, 'Unable to bulk register patients.');
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
  if (!res.ok) throw await citizenError(res, 'Unable to load scheduler status.');
  return res.json() as Promise<SchedulerStatus>;
}

export async function runSchedulerNow(token: string): Promise<SchedulerRun> {
  const res = await fetch(`${API_BASE}/api/scheduler/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw await citizenError(res, 'Unable to run the scheduler.');
  return res.json() as Promise<SchedulerRun>;
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
  if (!res.ok) throw await citizenError(res, 'Unable to load FAQs.');
  return res.json() as Promise<FaqList>;
}

export async function createFaq(token: string, payload: FaqPayload): Promise<KnowledgeFaq> {
  const res = await fetch(`${API_BASE}/api/knowledge/faqs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await citizenError(res, 'Unable to create FAQ.');
  return res.json() as Promise<KnowledgeFaq>;
}

export async function updateFaq(token: string, id: string, payload: FaqPayload): Promise<KnowledgeFaq> {
  const res = await fetch(`${API_BASE}/api/knowledge/faqs/${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await citizenError(res, 'Unable to update FAQ.');
  return res.json() as Promise<KnowledgeFaq>;
}

export async function deleteFaq(token: string, id: string): Promise<{ id: string; deleted: boolean }> {
  const res = await fetch(`${API_BASE}/api/knowledge/faqs/${id}/delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw await citizenError(res, 'Unable to delete FAQ.');
  return res.json() as Promise<{ id: string; deleted: boolean }>;
}

export async function fetchTrainingModules(token: string): Promise<TrainingModule[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/training`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await citizenError(res, 'Unable to load training modules.');
  return res.json() as Promise<TrainingModule[]>;
}

export async function fetchEmergencyProtocols(token: string): Promise<EmergencyProtocol[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/emergency`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await citizenError(res, 'Unable to load emergency protocols.');
  return res.json() as Promise<EmergencyProtocol[]>;
}

export async function searchKnowledge(token: string, q: string): Promise<KnowledgeSearchResult> {
  const res = await fetch(`${API_BASE}/api/knowledge/search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await citizenError(res, 'Unable to search knowledge.');
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

export async function fetchEnrollmentGuidebook(
  token: string,
  enrollmentId: string,
): Promise<GuidebookRef | null> {
  const res = await fetch(`${API_BASE}/api/enrollments/${enrollmentId}/guidebook`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to resolve guidebook');
  }
  const body = (await res.json()) as { guidebook: GuidebookRef | null };
  return body.guidebook;
}

export async function fetchWorklistItemGuidebook(
  token: string,
  itemId: string,
): Promise<GuidebookRef | null> {
  const res = await fetch(`${API_BASE}/api/worklist/items/${itemId}/guidebook`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Unable to resolve guidebook');
  }
  const body = (await res.json()) as { guidebook: GuidebookRef | null };
  return body.guidebook;
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
  | 'APPROVED'
  | 'REJECTED'
  | 'RESOLVED';

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
  resolution: DuplicateResolution | null;
  submittedBy: string;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  remarks: string | null;
}

export interface EnrollmentComparisonEntry extends EnrollmentSummary {
  guidebook: GuidebookRef | null;
}

export interface PatientComparisonSide {
  citizen: CitizenDetail['citizen'];
  programs: ProgramChip[];
  enrollments: EnrollmentComparisonEntry[];
  activities: ActivityEntry[];
  guidebooks: GuidebookRef[];
}

export interface DuplicateComparison {
  request: DuplicateRequest;
  current: PatientComparisonSide;
  duplicate: PatientComparisonSide;
}

/** Reason codes accepted by the backend, with friendly labels for the UI. */
export const DUPLICATE_REASONS: { value: string; label: string }[] = [
  { value: 'DUPLICATE_REGISTRATION', label: 'Duplicate registration' },
  { value: 'SAME_PERSON_DIFFERENT_UHID', label: 'Same person, different UHID' },
  { value: 'DATA_ENTRY_ERROR', label: 'Data entry error' },
  { value: 'MERGED_FAMILY_RECORD', label: 'Merged / family record' },
  { value: 'OTHER', label: 'Other' },
];

/** Maps a stored reason code to its friendly label (falls back to the code). */
export function duplicateReasonLabel(value: string): string {
  return DUPLICATE_REASONS.find((r) => r.value === value)?.label ?? value;
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

// ── Teleconsultation / Clinical Activity Lifecycle ───────────────────────────

/** A dynamic, program-specific clinical form field (from the event template). */
export interface ClinicalFieldDef {
  type: 'text' | 'longtext' | 'number' | 'dropdown' | 'radio' | string;
  label: string;
  options: string[];
  required: boolean;
  sortOrder: number;
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
  kind: 'ENROLLMENT' | 'ACTIVITY';
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
  if (!res.ok) throw await readError(res, 'Unable to load consultation.');
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
  if (!res.ok) throw await readError(res, 'Unable to save the consultation.');
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
  if (!res.ok) throw await readError(res, 'Unable to load consultation note.');
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
  if (!res.ok) throw await readError(res, 'Unable to load consultation history.');
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
  if (!res.ok) throw await readError(res, 'Unable to check for active consultation.');
  return res.json() as Promise<ActiveActivity | null>;
}

// ── Workflow Rules Engine (Administration) ───────────────────────────────────

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
  conditions: Record<string, unknown> | null;
  isActive: boolean;
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
  generatedEventId?: string;
  delayDays: number;
  priority: string;
  retryPolicy?: string | null;
  escalationRole?: string | null;
  notificationRole?: string | null;
  isActive: boolean;
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

// ── Clinical Decision Support Engine (CDSE) ───────────────────────────────────

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
