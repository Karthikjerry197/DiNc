'use client';

import { categoryLabel } from './category';

interface GuidebookToolbarProps {
  categories: string[];
  total: number;
  onComingSoon: (label: string) => void;
}

/**
 * Page-level toolbar for the Guidebooks workspace. All controls are visual
 * placeholders this milestone. Program/Category filter options are populated
 * from the real categories present in the loaded data.
 */
export default function GuidebookToolbar({
  categories,
  total,
  onComingSoon,
}: GuidebookToolbarProps) {
  return (
    <div className="gb-toolbar">
      <div className="gb-toolbar-row">
        <div>
          <h1 className="page-title">Guidebook</h1>
          <p className="page-subtitle">
            Clinical decision support · {total} {total === 1 ? 'protocol' : 'protocols'}
          </p>
        </div>
        <div className="gb-toolbar-actions">
          <button type="button" className="wl-btn" title="Bulk actions" onClick={() => onComingSoon('Bulk')}>
            ☰ Bulk
          </button>
          <button
            type="button"
            className="wl-btn wl-btn-primary"
            title="New protocol"
            onClick={() => onComingSoon('New Protocol')}
          >
            ＋ New Protocol
          </button>
        </div>
      </div>

      <div className="gb-toolbar-filters">
        <div className="wl-filter-search gb-toolbar-search">
          <span className="wl-filter-search-icon" aria-hidden="true">🔍</span>
          <input
            type="text"
            className="wl-filter-search-input"
            placeholder="Search protocols…"
            aria-label="Search protocols (coming soon)"
          />
        </div>
        <select className="wl-select" defaultValue="" aria-label="Filter by program">
          <option value="">All Programs</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {categoryLabel(category)}
            </option>
          ))}
        </select>
        <select className="wl-select" defaultValue="" aria-label="Filter by category">
          <option value="">All Categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {categoryLabel(category)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
