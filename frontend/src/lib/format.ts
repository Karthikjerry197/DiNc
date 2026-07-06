/**
 * Shared display formatters (M35D) — the single implementation of the
 * "value or em dash" helpers that were previously duplicated per component.
 */

/** "12 Mar 2026"-style locale date, or an em dash when absent. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** The trimmed text itself, or an em dash when null/blank. */
export function displayValue(text: string | null): string {
  return text && text.trim() ? text : '—';
}

/** Friendly display label for internal role codes (TopBar, Care Dashboard). */
export function roleLabel(role: string): string {
  switch (role) {
    case 'ADMIN':          return 'Administrator';
    case 'CLINICIAN':      return 'Clinical Staff';
    case 'CARE_ASSISTANT': return 'Care Assistant';
    case 'ANM':            return 'ANM';
    case 'Guest':          return 'Guest';
    default:               return role;
  }
}
