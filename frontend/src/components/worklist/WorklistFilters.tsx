'use client';

import { Search } from 'lucide-react';
import type { AssigneeOption, ProgramOption, WorklistItem } from '@/lib/api';

/** The Worklist's client-side filter state (M33.1 — filters are now live). */
export interface WorklistFilterState {
  search: string;
  program: string;
  disease: string;
  status: string;
  due: string;
  risk: string;
  assignee: string;
}

export const EMPTY_WORKLIST_FILTERS: WorklistFilterState = {
  search: '',
  program: '',
  disease: '',
  status: '',
  due: '',
  risk: '',
  assignee: '',
};

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ESCALATED', label: 'Escalated' },
];

const DUE_OPTIONS = [
  { value: 'DUE_TODAY', label: 'Due Today' },
  { value: 'OVERDUE', label: 'Overdue' },
];

const RISK_OPTIONS = [
  { value: 'SEVERE', label: 'Severe' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'LOW', label: 'Low Risk' },
];

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Applies the filter state to worklist items. Shared by the Worklist page. */
export function applyWorklistFilters(
  items: WorklistItem[],
  f: WorklistFilterState,
): WorklistItem[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((item) => {
    if (q) {
      const haystack = [item.uhid, item.citizen, item.program, item.subProgram, item.activity, item.type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (f.program && item.program !== f.program) return false;
    if (f.disease && item.type !== f.disease) return false;
    if (f.status === 'ESCALATED') {
      if (!item.isEscalation && item.status !== 'EMERGENCY') return false;
    } else if (f.status && item.status !== f.status) {
      return false;
    }
    if (f.due) {
      const t = item.dueDate ? new Date(item.dueDate).getTime() : null;
      if (t === null) return false;
      if (f.due === 'OVERDUE' && !(t < startOfToday() && item.status === 'PENDING')) return false;
      if (f.due === 'DUE_TODAY' && !(t >= startOfToday() && t <= endOfToday())) return false;
    }
    if (f.risk === 'LOW') {
      if (item.riskLevel === 'SEVERE' || item.riskLevel === 'MODERATE') return false;
    } else if (f.risk && item.riskLevel !== f.risk) {
      return false;
    }
    if (f.assignee && item.assignedTo !== f.assignee) return false;
    return true;
  });
}

interface WorklistFiltersProps {
  programs: ProgramOption[];
  assignees: AssigneeOption[];
  /** Distinct disease names present in the loaded items. */
  diseases: string[];
  filters: WorklistFilterState;
  onChange: (next: WorklistFilterState) => void;
}

/**
 * Filter toolbar — fully functional (M33.1). Program and Assignee options come
 * from real database records; disease options from the loaded items. Filtering
 * is applied client-side to the loaded worklist via applyWorklistFilters().
 */
export default function WorklistFilters({
  programs,
  assignees,
  diseases,
  filters,
  onChange,
}: WorklistFiltersProps) {
  const set = (patch: Partial<WorklistFilterState>) => onChange({ ...filters, ...patch });

  return (
    <div className="wl-filters">
      <div className="wl-filter-search">
        <span className="wl-filter-search-icon" aria-hidden="true"><Search size={14} /></span>
        <input
          type="text"
          className="wl-filter-search-input"
          placeholder="Search worklist…"
          aria-label="Search worklist"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
        />
      </div>

      <select className="wl-select" value={filters.program} aria-label="Filter by program"
        onChange={(e) => set({ program: e.target.value })}>
        <option value="">All Programs</option>
        {programs.map((program) => (
          <option key={program.id} value={program.name}>
            {program.name}
          </option>
        ))}
      </select>

      <select className="wl-select" value={filters.disease} aria-label="Filter by disease"
        onChange={(e) => set({ disease: e.target.value })}>
        <option value="">All Diseases</option>
        {diseases.map((disease) => (
          <option key={disease} value={disease}>
            {disease}
          </option>
        ))}
      </select>

      <select className="wl-select" value={filters.status} aria-label="Filter by status"
        onChange={(e) => set({ status: e.target.value })}>
        <option value="">All Statuses</option>
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select className="wl-select" value={filters.due} aria-label="Filter by due date"
        onChange={(e) => set({ due: e.target.value })}>
        <option value="">Any Due Date</option>
        {DUE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select className="wl-select" value={filters.risk} aria-label="Filter by clinical risk"
        onChange={(e) => set({ risk: e.target.value })}>
        <option value="">All Risk Levels</option>
        {RISK_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select className="wl-select" value={filters.assignee} aria-label="Filter by assignee"
        onChange={(e) => set({ assignee: e.target.value })}>
        <option value="">All Assignees</option>
        {assignees.map((assignee) => (
          <option key={assignee.username} value={assignee.username}>
            {assignee.fullName}
          </option>
        ))}
      </select>
    </div>
  );
}
