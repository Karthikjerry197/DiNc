'use client';

import type { GuidebookDetail } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { categoryIcon, categoryLabel } from './category';

interface GuidebookHeaderProps {
  detail: GuidebookDetail;
}

/** Main-content header: program, title, status and clinical badges. */
export default function GuidebookHeader({ detail }: GuidebookHeaderProps) {
  return (
    <div className="gb-header">
      <div className="gb-header-top">
        <span className="gb-header-icon" aria-hidden="true">{categoryIcon(detail.category)}</span>
        <div className="gb-header-meta">
          <span className="gb-header-program">{categoryLabel(detail.category)}</span>
          <h2 className="gb-header-title">{detail.title}</h2>
        </div>
      </div>

      <div className="gb-header-badges">
        <span className={`pill ${detail.status === 'Active' ? 'pill-completed' : 'pill-low'}`}>
          {detail.status}
        </span>
        <span className="gb-badge gb-badge-code">{detail.code}</span>
        <span className="gb-badge">{categoryLabel(detail.category)}</span>
        <span
          className="gb-badge gb-badge-muted"
          title={detail.version === null ? 'Version not recorded' : 'Current version'}
        >
          Version {detail.version ?? '—'}
        </span>
        <span className="gb-badge gb-badge-muted">Updated {formatDate(detail.updatedAt)}</span>
      </div>
    </div>
  );
}
