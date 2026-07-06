/**
 * Worklist urgency model (M36 Care Manager Workspace) — the single frontend
 * definition of "how urgent is this activity". Consumed by the Care Dashboard
 * (task grouping) and the Worklist page (care-manager ordering). Purely a
 * client-side view over the already-scoped backend data: it never changes what
 * the backend returns, only how it is grouped/ordered for frontline workers.
 */

import type { WorklistItem } from './api';

/** Statuses a worker can still act on; everything else sinks to the bottom. */
const ACTIONABLE = new Set(['PENDING', 'EMERGENCY']);

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * Urgency tiers (lower = more urgent):
 * 1 overdue · 2 severe risk / escalation · 3 due today · 4 high priority ·
 * 5 remaining (including non-actionable statuses).
 */
export function urgencyTier(item: WorklistItem): 1 | 2 | 3 | 4 | 5 {
  const status = item.status.toUpperCase();
  if (!ACTIONABLE.has(status)) return 5;
  const due = item.dueDate ? new Date(item.dueDate).getTime() : null;
  if (due !== null && due < startOfToday()) return 1;
  if (item.riskLevel === 'SEVERE' || item.isEscalation || status === 'EMERGENCY') return 2;
  if (due !== null && due <= endOfToday()) return 3;
  const priority = item.priority.toUpperCase();
  if (priority === 'URGENT' || priority === 'HIGH') return 4;
  return 5;
}

/**
 * Orders items most-urgent-first. The sort is stable, so within a tier the
 * backend's own ordering is preserved (the backend response is never mutated).
 */
export function sortByUrgency(items: WorklistItem[]): WorklistItem[] {
  return [...items].sort((a, b) => urgencyTier(a) - urgencyTier(b));
}

export interface CareTaskGroups {
  /** Overdue activities, severe patients and escalations (tiers 1–2). */
  immediate: WorklistItem[];
  /** Today's scheduled work (tier 3). */
  dueToday: WorklistItem[];
  /** Remaining assigned, actionable work (tiers 4–5). */
  upcoming: WorklistItem[];
}

/** Splits the scoped worklist into the Care Dashboard's three visual groups. */
export function groupCareTasks(items: WorklistItem[]): CareTaskGroups {
  const actionable = items.filter((i) => ACTIONABLE.has(i.status.toUpperCase()));
  const immediate: WorklistItem[] = [];
  const dueToday: WorklistItem[] = [];
  const upcoming: WorklistItem[] = [];
  for (const item of actionable) {
    const tier = urgencyTier(item);
    if (tier <= 2) immediate.push(item);
    else if (tier === 3) dueToday.push(item);
    else upcoming.push(item);
  }
  // Within "immediate", overdue still outranks severe-but-not-yet-due.
  return { immediate: sortByUrgency(immediate), dueToday, upcoming: sortByUrgency(upcoming) };
}

/** Distinct patients across a set of items (UHID-less rows are skipped). */
export function distinctPatients(items: WorklistItem[]): number {
  return new Set(items.map((i) => i.citizenId).filter(Boolean)).size;
}
