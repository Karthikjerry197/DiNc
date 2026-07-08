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

/**
 * Completed years between a date of birth and today (M39). Returns null when the
 * DOB is blank, unparseable, in the future, or implies an unrealistic age (>130).
 * Counts full years only — the current year is not credited until the birthday
 * has passed.
 */
export function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  if (birth > today) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  if (age < 0 || age > 130) return null;
  return age;
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
