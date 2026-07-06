import type { ReactNode } from 'react';
import { BookOpen } from 'lucide-react';

interface EmptyGuidebookProps {
  title: string;
  message: string;
  icon?: ReactNode;
}

/** Reusable empty state for the main panel (no selection, or a placeholder tab). */
export default function EmptyGuidebook({
  title,
  message,
  icon = <BookOpen size={22} />,
}: EmptyGuidebookProps) {
  return (
    <div className="gb-empty">
      <div className="gb-empty-icon" aria-hidden="true">{icon}</div>
      <div className="gb-empty-title">{title}</div>
      <div className="gb-empty-text">{message}</div>
    </div>
  );
}
