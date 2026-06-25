/**
 * Shapes returned by the read-only Citizen Workspace endpoints.
 *
 * Every value originates from a SELECT on existing tables. Fields that may be
 * absent are nullable / empty arrays so the UI renders professional empty states
 * rather than fabricating content. No data is ever invented.
 */

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
