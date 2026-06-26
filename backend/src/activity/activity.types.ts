/**
 * DTOs for the Activity read layer.
 *
 * An "activity" is a worklist_items row (the unit of work generated for an
 * enrollment's event). Every value comes from a SELECT on existing tables;
 * fields not modelled in the schema (e.g. remarks) are reported as null rather
 * than fabricated.
 */

export interface ActivityDto {
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

/** Raw row returned by the repository (snake_case from PostgreSQL). */
export interface ActivityRow {
  id: string;
  activity_name: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  assigned_role: string | null;
  due_date: Date | null;
  created_at: Date | null;
  completed_at: Date | null;
  event_id: string | null;
  event_name: string | null;
  enrollment_id: string | null;
}
