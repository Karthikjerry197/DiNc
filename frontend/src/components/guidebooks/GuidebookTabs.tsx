'use client';

/**
 * Formats an arbitrary section key into a human label. Pure formatting — it does
 * NOT know or assume any section names, so any future key (camelCase, snake_case
 * or kebab-case) renders sensibly with no code changes.
 *   "dangerSigns" → "Danger Signs", "laboratory_tests" → "Laboratory Tests"
 */
export function humanizeSectionKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface GuidebookTabsProps {
  /** Section keys, in the order supplied by the data. */
  tabs: string[];
  active: string;
  onChange: (key: string) => void;
}

/**
 * Renders one tab per section present in the guidebook. Fully data-driven: the
 * tab set comes entirely from the guidebook's sections, in stored order.
 */
export default function GuidebookTabs({ tabs, active, onChange }: GuidebookTabsProps) {
  return (
    <div className="gb-tabs" role="tablist" aria-label="Guidebook sections">
      {tabs.map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          className={`gb-tab${active === key ? ' active' : ''}`}
          onClick={() => onChange(key)}
        >
          {humanizeSectionKey(key)}
        </button>
      ))}
    </div>
  );
}
