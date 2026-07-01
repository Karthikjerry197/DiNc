/**
 * Shapes returned by the read-only Worklist overview endpoint.
 *
 * Every value originates from a SELECT query on existing tables. Fields that may
 * be absent for a given row are nullable so the UI can render an empty state
 * instead of fabricating content. No rows or statistics are ever invented.
 */

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
  /** Owning citizen id — enables navigation into the Citizen Workspace. */
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
  /** Current clinical risk level from active alerts (null = no alert / NONE). */
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
