'use client';

import type { AssigneeOption, ProgramOption } from '@/lib/api';

interface WorklistFiltersProps {
  programs: ProgramOption[];
  assignees: AssigneeOption[];
}

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed', 'Overdue', 'Escalated'];
const PRIORITY_OPTIONS = ['Urgent', 'High', 'Normal', 'Low'];
const TYPE_OPTIONS = ['Routine', 'Follow-up', 'Screening', 'Escalation'];

/**
 * Filter toolbar. Every control from the design renders here; for this milestone
 * the controls are presentational only (no filtering is applied to the table).
 * Program and Assignee options come from real database records.
 */
export default function WorklistFilters({ programs, assignees }: WorklistFiltersProps) {
  return (
    <div className="wl-filters">
      <div className="wl-filter-search">
        <span className="wl-filter-search-icon" aria-hidden="true">🔍</span>
        <input
          type="text"
          className="wl-filter-search-input"
          placeholder="Search worklist…"
          aria-label="Search worklist (coming soon)"
        />
      </div>

      <select className="wl-select" defaultValue="" aria-label="Filter by program">
        <option value="">All Programs</option>
        {programs.map((program) => (
          <option key={program.id} value={program.id}>
            {program.name}
          </option>
        ))}
      </select>

      <select className="wl-select" defaultValue="" aria-label="Filter by status">
        <option value="">All Statuses</option>
        {STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>

      <select className="wl-select" defaultValue="" aria-label="Filter by assignee">
        <option value="">All Assignees</option>
        {assignees.map((assignee) => (
          <option key={assignee.username} value={assignee.username}>
            {assignee.fullName}
          </option>
        ))}
      </select>

      <select className="wl-select" defaultValue="" aria-label="Filter by priority">
        <option value="">All Priorities</option>
        {PRIORITY_OPTIONS.map((priority) => (
          <option key={priority} value={priority}>
            {priority}
          </option>
        ))}
      </select>

      <select className="wl-select" defaultValue="" aria-label="Filter by type">
        <option value="">All Types</option>
        {TYPE_OPTIONS.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>

      <button type="button" className="wl-btn" title="Saved views (coming soon)" disabled>
        ▦ Views
      </button>
      <button type="button" className="wl-btn wl-btn-soft" title="Quick worklist (coming soon)">
        ⚡ Quick Worklist
      </button>
    </div>
  );
}
