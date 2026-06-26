/**
 * Presentation helpers for the clinical category code stored on a guidebook.
 * These only format the real category value — they do not invent data.
 */

const ICONS: Record<string, string> = {
  CHILD: '👶',
  COMMUNICABLE: '🦠',
  DIABETES: '🩸',
  ELDERLY: '🧓',
  EMERGENCY: '🚑',
  GENERAL: '📘',
  HYPERTENSION: '❤️',
  MATERNAL: '🤰',
  MENTAL_HEALTH: '🧠',
  RENAL: '🫘',
};

export function categoryIcon(category: string): string {
  return ICONS[category] ?? '📘';
}

export function categoryLabel(category: string): string {
  return category
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}
