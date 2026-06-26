interface EmptyGuidebookProps {
  title: string;
  message: string;
  icon?: string;
}

/** Reusable empty state for the main panel (no selection, or a placeholder tab). */
export default function EmptyGuidebook({ title, message, icon = '📘' }: EmptyGuidebookProps) {
  return (
    <div className="gb-empty">
      <div className="gb-empty-icon" aria-hidden="true">{icon}</div>
      <div className="gb-empty-title">{title}</div>
      <div className="gb-empty-text">{message}</div>
    </div>
  );
}
