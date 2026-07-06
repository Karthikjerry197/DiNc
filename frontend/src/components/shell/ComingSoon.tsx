import { Construction } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description?: string;
}

/**
 * Placeholder for modules that are navigable but not yet implemented. Used by
 * every non-Dashboard page in this milestone.
 */
export default function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{title}</h1>
      </div>
      <div className="coming-soon">
        <div className="coming-soon-icon" aria-hidden="true"><Construction size={26} /></div>
        <div className="coming-soon-title">Coming in a future milestone.</div>
        <div className="coming-soon-text">
          {description ?? `The ${title} module is not part of this milestone.`}
        </div>
      </div>
    </div>
  );
}
