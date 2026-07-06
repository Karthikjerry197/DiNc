'use client';

interface GuidebookSectionProps {
  /** A single section's value: text (paragraph) or an ordered list. */
  value: string | string[] | undefined;
}

/**
 * Renders one guidebook section's content, data-driven from guidebook_sections.
 * A string becomes a paragraph; an array becomes a list. The component knows
 * nothing about which sections exist — it renders whatever value it is given.
 */
export default function GuidebookSection({ value }: GuidebookSectionProps) {
  if (Array.isArray(value)) {
    return value.length > 0 ? (
      <ul className="gb-section-list">
        {value.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    ) : (
      <p className="gb-section-empty">Not available in the current records.</p>
    );
  }

  return value && value.trim() ? (
    <p className="gb-section-text">{value}</p>
  ) : (
    <p className="gb-section-empty">Not available in the current records.</p>
  );
}
